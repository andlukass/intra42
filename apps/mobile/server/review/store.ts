import { Firestore } from "@google-cloud/firestore";

const { FIRESTORE_EMULATOR_HOST, REVIEW_FIREBASE_PROJECT } = process.env;
if (
  !/^(?:localhost|127\.0\.0\.1):[1-9]\d{0,4}$/.test(FIRESTORE_EMULATOR_HOST ?? "") ||
  !/^demo-[a-z0-9-]+$/.test(REVIEW_FIREBASE_PROJECT ?? "")
) {
  throw new Error("Use a loopback Firestore emulator and a demo- project for review.");
}
export const db = new Firestore({ projectId: REVIEW_FIREBASE_PROJECT });
