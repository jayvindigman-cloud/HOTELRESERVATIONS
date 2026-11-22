const { createHmac, randomInt, randomBytes, sign, timingSafeEqual } = require("node:crypto");
const { readFileSync } = require("node:fs");
const pool = require("./db");
const { firebaseAccount, firebaseKey, project } = require("./guest-features");

const tokenUrl = "https://oauth2.googleapis.com/token";
const identity = "https://identitytoolkit.googleapis.com/v1";
const payload = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

function loadCredentials() {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) return null;
  try {
    const key = JSON.parse(readFileSync(path, "utf8"));
    if (key.project_id !== project || key.type !== "service_account" || !key.private_key || !key.client_email) {
      throw new Error("Invalid key or Firebase project mismatch");
    }
    return key;
  } catch {
    console.error("Signup OTP requires a Firebase service account for the configured project.");
    return null;
  }
}

function createFirebaseVerifier(key) {
  let cachedToken;
  let expires = 0;
  return async (email) => {
    const now = Math.floor(Date.now() / 1000);
    if (now >= expires - 60) {
      const assertion = payload({ alg: "RS256", typ: "JWT", kid: key.private_key_id }) + "." +
        payload({ iss: key.client_email, scope: "https://www.googleapis.com/auth/identitytoolkit", aud: tokenUrl, iat: now, exp: now + 3600 });
      const signature = sign("RSA-SHA256", Buffer.from(assertion), key.private_key).toString("base64url");
      const response = await fetch(tokenUrl, {
        method: "POST", body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: assertion + "." + signature,
        }), signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Could not authorize Firebase verification");
      const token = await response.json();
      cachedToken = token.access_token;
      expires = now + Number(token.expires_in);
    }
    const response = await fetch(identity + "/projects/" + encodeURIComponent(project) + "/accounts:sendOobCode", {
      method: "POST",
      headers: { Authorization: "Bearer " + cachedToken, "Content-Type": "application/json" },
      body: JSON.stringify({ requestType: "VERIFY_EMAIL", email, returnOobLink: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Could not generate Firebase verification action");
    const { oobLink } = await response.json();
    const action = new URL(oobLink).searchParams.get("oobCode");
    if (!action) throw new Error("Firebase verification action was missing");
    return action;
  };
}

async function applyFirebaseCode(code) {
  const response = await fetch(identity + "/accounts:update?key=" + encodeURIComponent(firebaseKey), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oobCode: code }), signal: AbortSignal.timeout(8000),
  });
  if (response.ok) return true;
  const result = await response.json().catch(() => null);
  if (["INVALID_OOB_CODE", "EXPIRED_OOB_CODE"].includes(result?.error?.message)) return false;
  throw new Error("Could not apply Firebase verification action");
}

async function initializeSignupOtp() {
  await pool.query(`CREATE TABLE IF NOT EXISTS signup_email_otps (
    uid VARCHAR(128) PRIMARY KEY, email VARCHAR(254) NOT NULL, salt CHAR(32) NOT NULL,
    code_hash CHAR(64) NOT NULL, firebase_code VARCHAR(512) NOT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0, sent_at DATETIME NOT NULL, expires_at DATETIME NOT NULL,
    INDEX (expires_at)
  ) ENGINE=InnoDB`);
  await pool.query("DELETE FROM signup_email_otps WHERE expires_at <= UTC_TIMESTAMP()");
}

function registerSignupOtp(app, wrap, sendEmail, mailConfigured, options = {}) {
  const key = options.key || loadCredentials();
  const enabled = Boolean(key && mailConfigured);
  const createAction = options.createAction || (enabled && createFirebaseVerifier(key));
  const applyAction = options.applyAction || applyFirebaseCode;
  const hash = (salt, code) => createHmac("sha256", key.private_key).update(salt + ":" + code).digest();
  let hour = -1;
  let sentThisHour = 0;
  const sending = new Set();

  app.get("/api/signup-verification", (_req, res) => res.set("Cache-Control", "no-store").json({ method: enabled ? "otp" : "link" }));
  function requireOtp(_req, res, next) {
    if (!enabled) return res.status(503).json({ message: "Email codes are temporarily unavailable." });
    res.set("Cache-Control", "no-store");
    next();
  }

  app.post("/api/signup-verification/send", requireOtp, firebaseAccount, wrap(async (req, res) => {
    const { localId: uid, email, emailVerified } = req.account;
    if (emailVerified) return res.json({ verified: true });
    const currentHour = Math.floor(Date.now() / 3600000);
    if (hour !== currentHour) { hour = currentHour; sentThisHour = 0; }
    if (sentThisHour >= 120 || sending.has(uid)) {
      return res.status(429).json({ message: "Too many code requests. Please try again later." });
    }
    sending.add(uid);
    try {
      const [[recent]] = await pool.query("SELECT uid FROM signup_email_otps WHERE uid=? AND sent_at > UTC_TIMESTAMP() - INTERVAL 1 MINUTE", [uid]);
      if (recent) return res.status(429).json({ message: "Wait one minute before requesting another code." });
      if (sentThisHour >= 120) return res.status(429).json({ message: "Too many code requests. Please try again later." });
      sentThisHour++;
      const code = String(randomInt(1000000)).padStart(6, "0");
      const salt = randomBytes(16).toString("hex");
      const action = await createAction(email);
      await pool.query(`INSERT INTO signup_email_otps (uid,email,salt,code_hash,firebase_code,sent_at,expires_at)
        VALUES (?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP()+INTERVAL 10 MINUTE)
        ON DUPLICATE KEY UPDATE email=VALUES(email),salt=VALUES(salt),code_hash=VALUES(code_hash),
        firebase_code=VALUES(firebase_code),attempts=0,sent_at=VALUES(sent_at),expires_at=VALUES(expires_at)`,
      [uid, email, salt, hash(salt, code).toString("hex"), action]);
      if (!(await sendEmail(email, "Your Hytech Hotel verification code",
        `<p>Your verification code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`))) {
        return res.status(503).json({ message: "The verification email could not be delivered. Try again in a minute." });
      }
      res.json({ message: "Verification code sent. Check your inbox and spam folder." });
    } catch {
      res.status(503).json({ message: "The verification code could not be sent. Please try again." });
    } finally {
      sending.delete(uid);
    }
  }));

  app.post("/api/signup-verification/confirm", requireOtp, firebaseAccount, wrap(async (req, res) => {
    const { localId: uid, email, emailVerified } = req.account;
    if (emailVerified) return res.json({ verified: true });
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: "Enter the six-digit code from your email." });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[challenge]] = await conn.query(`SELECT salt, code_hash, firebase_code FROM signup_email_otps
        WHERE uid=? AND BINARY email=BINARY ? AND expires_at > UTC_TIMESTAMP() AND attempts < 5 FOR UPDATE`, [uid, email]);
      if (!challenge || !timingSafeEqual(hash(challenge.salt, code), Buffer.from(challenge.code_hash, "hex"))) {
        if (challenge) await conn.query("UPDATE signup_email_otps SET attempts=attempts+1 WHERE uid=?", [uid]);
        await conn.commit();
        return res.status(400).json({ message: "The code is incorrect or expired. Request a new code if needed." });
      }
      const verified = await applyAction(challenge.firebase_code);
      await conn.query("DELETE FROM signup_email_otps WHERE uid=?", [uid]);
      await conn.commit();
      if (!verified) return res.status(400).json({ message: "That code expired. Request a new code." });
      res.json({ verified: true });
    } catch {
      await conn.rollback();
      res.status(503).json({ message: "Could not verify your email right now. Try again." });
    } finally {
      conn.release();
    }
  }));
}

module.exports = { initializeSignupOtp, registerSignupOtp };
