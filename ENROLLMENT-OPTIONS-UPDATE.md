# Enrollment Options for Unenrolled Cards - Update Complete ✅

## What Changed

When an unenrolled card is tapped, users now have **THREE options** to choose their workflow:

### 1. **Enroll & Go to POS** (or **Enroll & Process Payment**)
- Registers the card and creates a student account
- Immediately opens the payment dialog/goes to POS
- Perfect for quick enrollment + immediate purchase

### 2. **Enroll & Top-up**
- Registers the card and creates a student account
- Navigates to the Top-up page
- **Auto-selects the newly enrolled student** ✨
- Perfect for enrolling and immediately adding funds

### 3. **Enroll Only**
- Registers the card and creates a student account
- Returns to the current page (or stays on page)
- Perfect for bulk enrollment sessions

## Where This Works

### A. Global Tap Alert (Non-POS Pages)
When you tap an unenrolled card on any page **except** `/pos`:
- A drawer appears at the bottom
- Shows "Card not found in system"
- Click "Enroll Card" to open the enrollment form
- **Four buttons:**
  - 🟢 **"Enroll & Go to POS"** - Enrolls and navigates to POS page
  - 🔵 **"Enroll & Top-up"** - Enrolls and navigates to Top-up page
  - 🟡 **"Enroll Only"** - Just enrolls, stays on current page
  - ⚪ **"Back"** - Return to previous screen

### B. POS Page Direct Taps
When you tap an unenrolled card **on the POS page** (tap-first mode):
- A dialog appears immediately
- Shows "This card is not registered"
- Enter student name
- **Four buttons:**
  - 🟢 **"Enroll & Process Payment"** - Enrolls and opens payment dialog
  - 🔵 **"Enroll & Top-up"** - Enrolls and goes to Top-up page
  - 🟡 **"Enroll Only"** - Just enrolls, shows success message
  - ⚪ **"Cancel"** - Closes dialog without enrolling

## User Experience Flow

### Scenario 1: Quick Sale with New Card
1. Staff is on POS page
2. Student taps unenrolled card
3. Enrollment dialog opens
4. Staff enters student name
5. Clicks "Enroll & Process Payment"
6. Payment dialog opens immediately with student selected
7. Staff enters amount and completes purchase

### Scenario 2: New Student Needs Funds
1. Staff is on any page
2. Student taps unenrolled card
3. Tap alert drawer opens
4. Staff clicks "Enroll Card"
5. Enters student name
6. Clicks "Enroll & Top-up"
7. Navigates to Top-up page with **student auto-selected** ✨
8. Staff just enters amount and completes top-up

### Scenario 3: Bulk Enrollment
1. Staff is on Students page or Dashboard
2. Student taps unenrolled card
3. Tap alert drawer opens
4. Staff clicks "Enroll Card"
5. Enters student name
6. Clicks "Enroll Only"
7. Stays on current page, ready for next card

### Scenario 4: Enrollment Then Sale
1. Staff is anywhere in the app
2. Student taps unenrolled card
3. Tap alert drawer opens
4. Staff clicks "Enroll Card"
5. Enters student name
6. Clicks "Enroll & Go to POS"
7. Navigates to POS page ready for transaction

## Technical Details

### Files Modified

1. **`web-next/components/tap-alert.tsx`**
   - Updated `handleEnrollmentSubmit` to accept destination parameter ('pos' | 'topup' | 'none')
   - Changed form to have three action buttons
   - Passes student ID to top-up page via query parameter
   - Conditionally navigates based on user choice

2. **`web-next/app/pos/pos-form.tsx`**
   - Added enrollment dialog state
   - Created `handleEnrollCard` function with action parameter ('checkout' | 'topup' | 'none')
   - Added enrollment dialog UI with four buttons
   - Modified `handleCardTap` to open enrollment dialog for unknown cards
   - Passes student ID to top-up page via query parameter

3. **`web-next/app/topup/topup-form.tsx`**
   - Added `useSearchParams` hook to read query parameters
   - Auto-selects student from `?student=ID` query parameter
   - Clears query parameter after auto-selection

4. **`web-next/app/topup/page.tsx`**
   - Wrapped TopupForm in Suspense boundary for useSearchParams support

### Button Variants
- **Primary (default)**: Enroll & Go to POS / Process Payment
- **Secondary**: Enroll & Top-up, Enroll Only
- **Outline**: Cancel/Back

## Testing

To test the feature:
1. Have an NFC reader connected
2. Tap an unenrolled card on different pages
3. Try both enrollment options
4. Verify correct navigation/behavior

## Benefits

✅ **Maximum Flexibility**: Three distinct workflows to choose from
✅ **Enrollment + Sale**: Quick enrollment and immediate purchase
✅ **Enrollment + Funding**: Enroll and add balance right away with auto-selection
✅ **Smart Auto-Selection**: Top-up page automatically selects the new student
✅ **Bulk Enrollment**: Efficient mass enrollment without page changes
✅ **Better UX**: Clear options, no confusion about what happens next
✅ **Complete Workflow**: Cover all common enrollment scenarios
✅ **Reduced Steps**: No need to manually find and select the student after enrollment

