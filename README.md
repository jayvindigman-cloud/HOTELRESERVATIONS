# Hytech Hotel & Bistro

Online room reservations, bistro ordering, and hotel management for Hytech Hotel & Bistro in Bongabong, Oriental Mindoro, Philippines.

[Visit the hotel website](https://hytechreservation.netlify.app)

## Key features

### Guest website

| Feature | What guests can do |
| --- | --- |
| Public hotel and room directory | Browse the hotel, room photos, rates, capacity, bed details, menu, reviews, and contact information before signing in. Filter rooms by category and open the details for each room type. |
| Availability calendar | See how many units are available out of the total for each room type and date. Confirmed reservations reduce availability, and early checkout releases the remaining nights. |
| Online reservations | Sign in when ready to reserve and return to the selected room and date. The four-step form covers rooms, stay details, extras, and payment. Book multiple rooms, enter occupants' names, and add special requests. |
| Extras and payments | Choose optional services with photos and see an updated total. Apply eligible vouchers to room charges, choose cash or GCash, and enter a GCash reference for hotel review. |
| Reservation receipts | View a booking reference, dates, room and occupant details, service charges, discounts, payment, and booking status. New submissions show an animated “Congratulations!” receipt while approval is pending. |
| Bistro ordering | Browse the menu by category, see dish photos and stock status, add dishes to My Order, adjust quantities, and specify room or table delivery and special requests. Dish photos appear in the cart, receipt, and order history. |
| Guest profile | Update the display name and profile photo. Manage reservations and food orders separately, view assigned room numbers and receipts, book or order again, cancel eligible requests, and check out early during an active stay. |
| Guest notifications | See red dots for confirmed reservations and food orders that are preparing or served. Opening the corresponding profile section marks the updates as viewed. |
| Stay reviews | Rate the room and service separately from one to five stars and leave a comment after an eligible stay. Filter public reviews by room type and open room details from the photo. |
| Account access | Sign in with Google or email and password. Verify new email accounts with a six-digit code when backend mail and Firebase service credentials are configured. Firebase sends a verification link otherwise. Password-based guests can change or reset their password. |

### Admin and front desk

| Feature | What staff can do |
| --- | --- |
| Dashboard | See today's booked, pending, and available rooms. Open room-type counts, drill into today's and upcoming arrivals and departures, and open the five latest reservations. |
| Revenue | View and print the all-time total, with separate subtotals for paid, non-cancelled reservations and served food orders. |
| Occupancy calendar | Navigate months, read color-coded occupancy, and click a date to see its reservations and available guest photos. Approve or decline bookings, select a room with an available key, and record early checkout. |
| Booking management | Create, edit, search, filter, approve, decline, or delete reservations. Review occupants, extras, special requests, room assignments, payment references, and payment status. |
| Booking reports | Print reservations, booking details, and guest counts by room type for today or the last 7, 30, or 365 days, based on booking creation date. |
| Client directory and history | Search by guest, companion, email, or booking reference, and filter by stay dates. Open guest profiles to see contact information, profile photos, the latest booking, earlier stays, and food orders. The History tab includes completed and cancelled bookings. |
| Room management | Add or edit room types, photos, descriptions, bed details, capacity, rates, unit counts, and visibility. Room cards use a photo backdrop and a translucent details panel. |
| Key management | Browse rooms or confirmed booked guests, expand room panels, and assign keys to guests. Register keys, record handovers and returns, release assignments, track lost or damaged keys, review activity, and print cut-out key labels. |
| Discounts | Create and manage fixed-amount or percentage vouchers, set expiry dates, and enable or disable codes. |
| Food order management | See incoming dish photos, quantities, delivery details, and requests. Update orders through Pending, Preparing, Served, or Cancelled. Browse closed orders in History and print daily or 30-day served order reports. |
| Menu management | Add or edit dishes, photos, categories, descriptions, and prices. Set menu items to available, out of stock, or unavailable. |
| Extras management | Configure add-on services and their visibility, prices, and billing units per stay, night, guest, or item. Add service photos from a file or a direct HTTPS image link. |
| Review oversight | Browse guest feedback with room and service ratings, comments, booking references, and room photos. |
| Notifications | Track new reservations and orders with sidebar badges. Switch between unread and read alerts, then open the related booking or order. |
| Customer service | Request a password reset email for a guest who signs in with a website password. |

### Design and technology

- **Interface** — Responsive mobile and desktop layouts, glass panels, custom icons, and animations that respect reduced-motion preferences.
- **Frontend** — React 19, Vite, and CSS.
- **Backend and data** — Node.js and Express, MySQL or MariaDB for hotel records, Firebase Authentication for sign-in, and Firestore for account profiles and administrator roles.
- **Deployment** — GitHub for source control and Netlify for the frontend, with a separately running Express API.

## Local development

Run the root React app and the Express backend. On Windows, the VS Code launch task runs `scripts/start-local.ps1`. It expects XAMPP MySQL on port 3307 and the backend on port 8080. The Vite server forwards `/api` to the backend. For a LAN layout check, run `npm run dev -- --host 0.0.0.0` and open the displayed network URL from the phone.

## Netlify deployment

1. Deploy the Express backend separately on a host that runs Node.js 24 and provides a public HTTPS URL. From the repository root the backend install command is `npm ci --prefix backend` and the start command is `npm start --prefix backend`. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` there. Set `DB_SSL=true` if required by the database provider. Set `CORS_ORIGINS` to the Netlify site origin, with comma-separated origins if you also use a custom domain.
2. For an empty MySQL or MariaDB database, apply `backend/schema.sql` to the selected database before starting the backend. The backend creates the supporting tables and seeds the dining menu. Add room inventory in the admin dashboard or migrate the existing hotel database if you intend to carry its data forward.
3. In Netlify, use the repository root as the base directory. The checked-in configuration builds with `npm run build` and publishes `dist`. Set the Netlify build variable `VITE_API_BASE_URL` to the public HTTPS backend URL including `/api`, such as `https://api.example-hotel.com/api`. If uploading `dist` manually, set this variable in your local build environment before building.
4. Add the Netlify hostname and any custom domain to the Firebase Authentication **Authorized domains** list. Keep the existing Firebase project to retain guest accounts and Google sign-in. If you use a different project's backend configuration, align `FIREBASE_PROJECT_ID` and `FIREBASE_WEB_API_KEY` on the backend with the frontend Firebase configuration.
5. If the hotel sends email, set `GMAIL_USER` and `GMAIL_APP_PASSWORD` on the backend only. Revoke the old app password previously stored in source and use a replacement before sharing or publishing the repository.

After deploying, check the menu and room calendar, sign in as a guest and as an admin, and verify a test booking from the deployed URL.

## Signup verification codes

To send six-digit signup codes, configure `GMAIL_USER` and `GMAIL_APP_PASSWORD` on the Express host. Set `GOOGLE_APPLICATION_CREDENTIALS` to the path of a service-account JSON file for the same project as `FIREBASE_PROJECT_ID`. The service account needs the `firebaseauth.users.sendEmail` permission to generate a Firebase email-verification action. Keep the JSON outside the repository and web root.

Restart Express after setting the environment. `GET /api/signup-verification` reports `otp` when both credential sets are configured. With either configuration absent, new accounts continue to receive the Firebase verification link. Sign-in and password recovery still use Firebase.
