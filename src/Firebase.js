import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";


const firebaseConfig = {
  apiKey: "AIzaSyAvLYLd3Q6FeAHhE-Xw6WO1hPOdfXgREYA",
  authDomain: "hotel-reservation-f1a6e.firebaseapp.com",
  projectId: "hotel-reservation-f1a6e",
  storageBucket: "hotel-reservation-f1a6e.firebasestorage.app",
  messagingSenderId: "551265800789",
  appId: "1:551265800789:web:99a9cd88b9290366b43adc",
  measurementId: "G-KZM13HDZFR"
};


const app = initializeApp(firebaseConfig);
isSupported().then((supported) => { if (supported) getAnalytics(app); }).catch(() => {});

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
export const db = getFirestore(app);
