#!/bin/bash
# System-Wide Sensitive Intent Contract v1 — chat-layer guard.
# Bound to the Stop hook in ~/.claude/settings.json (and on chittyserv-vm).
#
# Scans the last assistant message for credential-asking and admin-bypass
# phrasings. The operator is the OPERATOR ONLY — never a credential store,
# KVS, auth provider, or routing authority. Any assistant turn that asks
# the user to surface, paste, widen, expand, or admin-edit a credential
# is a contract violation and MUST be blocked.
#
# Stop hook receives JSON on stdin with a transcript array of
# {role, content} objects. content can be a string OR an array of
# content blocks [{type: "text", text: "..."}].
#
# Exit 0 + empty stdout  = pass through silently.
# Exit 0 + JSON {"decision":"block","reason":"..."} = block the turn.

json=$(cat)

last_message=$(echo "$json" | jq -r '
  (.transcript // [])
  | map(select(.role == "assistant"))
  | last
  | if .content | type == "array"
    then .content | map(select(.type == "text") | .text) | join("\n")
    else (.content // "")
    end
' 2>/dev/null)

if [ -z "$last_message" ] || [ "$last_message" = "null" ]; then
  exit 0
fi

# Lowercased copy for case-insensitive matching.
lower=$(printf '%s' "$last_message" | tr '[:upper:]' '[:lower:]')

# Verbs that imply asking the user to surface a value to chat.
# Anchored at word boundaries to avoid e.g. "expose" matching "exposed".
verb_re='\b(paste|provide|share|copy|export|enter|give me|hand over|send me|put in|put the|tell me)\b'

# Sensitive nouns. Includes common synonyms and credential-y phrasings.
noun_re='\b(api[ _-]?key|secret|secret key|access[ _-]?key|access[ _-]?token|api[ _-]?token|auth[ _-]?token|bearer[ _-]?token|service[ _-]?token|deploy[ _-]?token|refresh[ _-]?token|password|passphrase|credential|credentials|client[ _-]?secret|private[ _-]?key|signing[ _-]?key|cf[ _-]?api[ _-]?token|cloudflare[ _-]?api[ _-]?token|github[ _-]?token|notion[ _-]?token|slack[ _-]?token|openai[ _-]?key|anthropic[ _-]?key|hmac[ _-]?secret|jwt[ _-]?secret|.env|env file|dotenv|connection[ _-]?string)\b'

# Match if a verb and a noun appear within a short window (~80 chars) on either side.
flat=$(printf '%s' "$lower" | tr '\n' ' ' | tr -s ' ')

block_with() {
  local reason="$1"
  jq -nc --arg r "$reason" '{decision:"block", reason:$r}'
  exit 0
}

CONTRACT_REASON="System-Wide Sensitive Intent Contract v1 violation. The user is OPERATOR ONLY — not a credential store, KVS, auth provider, or routing authority. Route through ChittyConnect / ChittyAuth / ch1tty broker, or fail closed with a canonical error code (POLICY_BLOCKED_MANDATORY_BROKER_ROUTE, POLICY_BLOCKED_BROKER_UNAVAILABLE, MISSING_CREDENTIAL_MATERIAL, INSUFFICIENT_SCOPE)."

# 1. Classic verb+noun (or noun+verb) credential-asking patterns.
if echo "$flat" | grep -E "$verb_re[^.?!]{0,80}$noun_re" >/dev/null \
   || echo "$flat" | grep -E "$noun_re[^.?!]{0,80}$verb_re" >/dev/null; then
  block_with "$CONTRACT_REASON"
fi

# 2. Direct phrasings that don't fit verb+noun template.
if echo "$flat" | grep -Ei '\b(what(.s| is) your)\b[^.?!]{0,80}'"$noun_re" >/dev/null \
   || echo "$flat" | grep -Ei "$noun_re"'[^.?!]{0,80}\b(value|please|here|in chat|in the chat|inline)\b' >/dev/null \
   || echo "$flat" | grep -Ei '\bauthorize the (cf )?(api )?(secret|token|key)\b' >/dev/null; then
  block_with "$CONTRACT_REASON"
fi

# 3. Admin-bypass phrasings — the textbook violation pattern: instead of
#    routing through the broker, the assistant tells the operator to go
#    administer the credential directly in the provider UI / 1P admin /
#    token-allowed-vaults UI. This is direct_provider_secret_bypass.
admin_bypass_re='\b(in (the )?(1p|1password|onepassword|cloudflare|cf|github|gh|notion|slack|stripe|vercel|neon)( admin| dashboard| ui| console)?|in (your )?(1p|1password|onepassword) (admin|console|ui|dashboard|vault)|widen|expand|broaden|loosen|enlarge|extend) (.{0,80})?(scope|access|token|key|secret|allowed[ _-]?(vault|vaults|paths)|vault list|allowlist|allow[ _-]?list)'
if echo "$flat" | grep -Ei "$admin_bypass_re" >/dev/null; then
  block_with "$CONTRACT_REASON"
fi

# 4. Direct "drop ... in 1P" / "add ... to that token's allowed vaults" patterns.
# Allow up to 60 chars between the verb and the bypass target so phrasings
# like "Add the chittyconnect vault to that token's allowed vaults in 1Password"
# and "Drop the new secret in 1P" are both caught.
if echo "$flat" | grep -Ei '\b(drop|add|put|stash|store|append) [^.?!]{0,60}\b(in|into|to)\b [^.?!]{0,40}\b(1p|1password|onepassword|allowed[ _-]?(vault|vaults|path|paths)|allow[ _-]?list|vault[ _-]?list)\b' >/dev/null; then
  block_with "$CONTRACT_REASON"
fi

# 5. "go to the X admin and ..." pattern — an operator-handoff bypass.
if echo "$flat" | grep -Ei '\bgo (to|into) (the )?(1p|1password|onepassword|cloudflare|cf|github|gh|notion|stripe|vercel|neon)( (admin|dashboard|ui|console))? (and|to)\b' >/dev/null; then
  block_with "$CONTRACT_REASON"
fi

# 6. "manually rotate / manually create / manually issue" credential phrasings.
if echo "$flat" | grep -Ei '\bmanually (rotate|create|issue|generate|provision|mint|edit|update) (.{0,40})?(token|key|secret|credential|api[ _-]?key)' >/dev/null; then
  block_with "$CONTRACT_REASON"
fi

exit 0
