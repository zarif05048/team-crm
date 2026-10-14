# Workspace appearance

The sidebar offers Light, Dark and System on desktop, and a compact theme
switch on mobile. A mobile chat also has a switch in its header because the
sidebar is hidden there. Admin Settings includes visual previews of all three
choices. Theme selection is available to every signed-in role through the
sidebar and is saved per device under `hijraa-crm-theme`.

System follows the operating system and reacts to changes without a refresh.
Choices synchronize between open tabs. The bootstrap script sets the theme
before the body paints; the controller updates native control colors and the
browser/PWA theme color. Restricted storage still permits session switching.

`globals.css` defines surfaces, text, brand accents and status palettes.
Use `bg-surface` for cards, menus and form controls, and `text-primary` for
brand-colored text. Keep fixed white for the logo chip and text on solid
message/action backgrounds. Use fixed black for modal backdrops.

Validation: `node scripts/test-theme.mjs`, TypeScript, lint and production
build; desktop and 390px mobile visual checks. The temporary preview and its
temporary proxy exclusion were removed before deployment. No dependencies or
database changes are required.
