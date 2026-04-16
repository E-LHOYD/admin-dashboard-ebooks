import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC4KD1_3W7Vp9g9gXymlSYp1RigY9KEJaw",
  authDomain: "gd-library.firebaseapp.com",
  projectId: "gd-library",
  appId: "1:223899471865:android:b7548e20286e3e86e6b728"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);