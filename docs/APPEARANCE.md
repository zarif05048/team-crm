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
Dark mode uses true black backgrounds and neutral charcoal surfaces; blue
and cyan remain accents. Text and secondary labels use bright neutral grays.
Small metadata is at least 12px in dark mode. Disabled control labels remain
legible, search highlights use dark text on gold, and tag labels automatically
choose black or white for contrast against their stored colors.

Desktop has draggable vertical dividers beside the main navigation and
between the inbox and conversation. Each divider has a visible grip and
focus highlight. Drag either divider to resize its left panel; the
conversation fills the remaining space. Double-click or press Enter to
restore that panel's default width. Arrow keys adjust by 10px, Shift + Arrow
keys by 40px, and Home/End choose the allowed minimum/maximum.

Panel widths are saved per device under `hijraa-crm-panel-navigation` and
`hijraa-crm-panel-inbox`. Resizing the window temporarily fits the saved
widths into the available space, with minimum widths for readable panels.
Mobile keeps its existing list/chat layout and hides the desktop dividers.

Use `bg-surface` for cards, menus and form controls, and `text-primary` for
brand-colored text. Keep fixed white for the logo chip and text on solid
message/action backgrounds. Use fixed black for modal backdrops.

Validation: `node scripts/test-theme.mjs`, `node scripts/test-panel-size.mjs`, TypeScript, lint and production
build; desktop and 390px mobile visual checks. The temporary preview and its
temporary proxy exclusion were removed before deployment. No dependencies or
database changes are required.
