// Shared design tokens (DESIGN.md "Colors"): the one brand palette both surfaces draw from.
// Radii, shadows and type stay per surface on purpose — the Storefront ("Clear Sky Counter") and
// the Admin Portal ("Confident Dark Console") share a palette, not a look. Import from both
// tailwind configs; never duplicate these literals.
export const brand = {
    green: '#22AD52', // palm green — cart badge, success accents only
    blue: '#005696', // sky blue — the Storefront's one "act here" colour; admin nav/focus only
    cyan: '#00AEEF', // aqua glow — decorative only
    'green-soft': '#f0fdf4',
    'blue-soft': '#f0f9ff',
};

export const ringFocus = brand.blue;

// Semantic status palette shared by both surfaces (always the -50 tint as ground with the matching
// -600/-700 shade as ink; never gray text on these tints). Tailwind's own scale, named by role so
// order and delivery states read the same everywhere.
export const status = {
    success: { ground: '#ecfdf5', ink: '#047857' }, // emerald-50 / emerald-700
    attention: { ground: '#fffbeb', ink: '#b45309' }, // amber-50 / amber-700
    danger: { ground: '#fef2f2', ink: '#b91c1c' }, // red-50 / red-700
    info: { ground: '#eff6ff', ink: '#1d4ed8' }, // blue-50 / blue-700
    neutral: { ground: '#f1f5f9', ink: '#475569' }, // slate-100 / slate-600
};
