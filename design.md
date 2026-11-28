# Design guidelines

## Mobile screen titles

Secondary screens opened from another screen use the native stack navigation
header for their page title, following Achievements. Configure `headerShown:
true`, a descriptive English `title` in sentence case, and
`headerBackButtonDisplayMode: "minimal"` in `apps/mobile/app/_layout.tsx`.
Keep the system header's typography and alignment, with the native back button
on the left. Do not repeat the page title as an uppercase heading inside the
scrollable content. Card and section headings remain within the content.

Screens reached from the bottom tab bar may keep their own content heading.

## Native mobile modals

Use the Slots modal as the reference for modal presentation throughout the app:
React Native `Modal`, `animationType="slide"`, an iOS `pageSheet`, and the
platform's full-screen modal on Android. Keep presentation consistent between
screens while adapting the content to each feature. Do not add custom drag
handles, notches, or decorative bars above the content. Let the platform provide
the native modal chrome and respect safe areas.

Slots, event, and campus chooser modals share `apps/mobile/src/ModalFooter.tsx` for their Close action and primary action. Keep their outer safe-area edges consistent (left/right on iOS; top/left/right on Android) so bottom spacing matches.

Modal footers use 32 px of horizontal padding and 18 px of vertical padding to
keep actions clear of the sheet's rounded corners. Use the shared `Button` from
`apps/mobile/src/ui.tsx` for actions. Secondary actions such as Close and Cancel
use `variant="secondary"`: dark text, a white background, and a subtle
border. Reuse this variant for future secondary buttons instead of custom
`Pressable` styles. Primary actions such as Subscribe use a turquoise background
with white text through the shared default `Button` style. Supporting actions
such as Share event use `variant="outline"` with a turquoise label and optional
leading icon, a white background, and a subtle border. Cancellation actions such
as Unsubscribe use `variant="danger"`, with a muted red background and white
text. Keep Subscribe turquoise and change to the danger variant when subscribed.

## Loading states

Prefer skeleton placeholders over loading text for content that is being fetched.
Match the placeholder size to the final content to avoid layout shifts. Keep
already loaded content visible while refreshing, and show explicit messages for
errors and empty states.

Whenever a UI change affects content that has a skeleton, update the skeleton in
the same change. Keep its structure, dimensions, spacing, and visual styling in
sync with the final content.

## Mobile cards

Use the shared `Card` component from `apps/mobile/src/ui.tsx` for titled cards,
and `styles.card` from the same module for cards without a heading. Reuse its
surface color, corner radius, padding, spacing, and shadow instead of recreating
card containers per screen. The Slots calendar and Pending evaluations use the
same card surface. Borders inside a card may define a calendar grid or other
structured content; they do not replace the shared outer card.

## Action toasts

Use the shared `Toast` and `useToast` from `apps/mobile/src/ui.tsx` for action
feedback. Error toasts use a red background and white text. Success toasts have a turquoise background, white text, a thin white
border, rounded corners, and a subtle shadow. They disappear after three seconds
and must remain above navigation or modal footer actions. Show success only after
the server confirms the mutation. Slots and event subscriptions use this same
component; avoid persistent success messages in the page content.
