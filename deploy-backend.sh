#!/bin/bash
# deploy-backend.sh
# Run this ONCE to deploy Cloud Functions + Firestore rules to Firebase.
# After this, your Netlify frontend will be able to save bills.

echo "========================================"
echo "  JijuBill — Firebase Backend Deploy"
echo "========================================"

# Check firebase-tools is installed
if ! command -v firebase &> /dev/null; then
  echo "Installing Firebase CLI..."
  npm install -g firebase-tools
fi

echo ""
echo "Step 1: Login to Firebase"
firebase login

echo ""
echo "Step 2: Install Cloud Functions dependencies"
cd functions && npm install && cd ..

echo ""
echo "Step 3: Deploy Firestore rules + indexes"
firebase deploy --only firestore

echo ""
echo "Step 4: Deploy Cloud Functions"
firebase deploy --only functions

echo ""
echo "========================================"
echo "  ✅  Backend deployed successfully!"
echo "  Your Netlify app can now save bills."
echo "========================================"
