p = 'apps/customer/src/app/globals.css'
s = open(p).read()
before = s

# --- Status ramp: badges + alerts -----------------------------------------
# A badge's border is the same strength as its siblings, so one token replaces
# four near-identical rules; the colour still comes from the rule's `color`.
for var in ('success', 'warning', 'danger', 'info'):
    s = s.replace(
        f"  border-color: color-mix(in srgb, var(--{var}) 40%, transparent);",
        "  border-color: var(--status-line);",
    )
s = s.replace(
    "  border-color: color-mix(in srgb, var(--danger) 45%, transparent);",
    "  border-color: var(--status-line);",
)

# Alerts: line + fill.
s = s.replace(
    "  border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent);\n"
    "  background: color-mix(in srgb, var(--danger) 12%, transparent);",
    "  border: 1px solid var(--status-line);\n  background: var(--status-fill);",
)
s = s.replace(
    "  border-color: color-mix(in srgb, var(--success) 40%, transparent);\n"
    "  background: color-mix(in srgb, var(--success) 12%, transparent);",
    "  border-color: var(--status-line);\n  background: var(--status-fill);",
)
s = s.replace(
    "  background: color-mix(in srgb, var(--danger) 12%, transparent);\n"
    "  border-color: color-mix(in srgb, var(--danger) 30%, transparent);",
    "  background: var(--status-fill);\n  border-color: var(--status-line);",
)
s = s.replace(
    "  background: color-mix(in srgb, var(--success) 12%, transparent);\n"
    "  border-color: color-mix(in srgb, var(--success) 30%, transparent);",
    "  background: var(--status-fill);\n  border-color: var(--status-line);",
)

# --- Neutral overlay ramp -------------------------------------------------
s = s.replace(
    "  background: color-mix(in srgb, var(--band-text) 12%, transparent);",
    "  background: var(--band-btn-hover);",
)
s = s.replace(
    "  background: color-mix(in srgb, var(--surface-raised) 40%, transparent);",
    "  background: var(--well-bg);",
)
s = s.replace(
    "    color-mix(in srgb, var(--text) 6%, transparent) 0%,\n"
    "    color-mix(in srgb, var(--text) 13%, transparent) 50%,\n"
    "    color-mix(in srgb, var(--text) 6%, transparent) 100%",
    "    var(--skeleton-from) 0%,\n    var(--skeleton-to) 50%,\n    var(--skeleton-from) 100%",
)
s = s.replace(
    "  background: color-mix(in srgb, var(--text) 4%, transparent);",
    "  background: var(--overlay-hover);",
)
s = s.replace(
    "  background: color-mix(in srgb, var(--text-faint) 50%, transparent);",
    "  background: var(--dot-muted);",
)
s = s.replace(
    "    color-mix(in srgb, var(--surface-raised) 92%, var(--gold) 8%),",
    "    var(--auth-sheen),",
)

assert s != before, 'no replacements were applied'
open(p, 'w').write(s)
print('rewrote rule-level color-mix sites')
