interface NamedLocation {
  name?: string | null;
  chain?: { name?: string | null } | null;
}

// Both spellings occur in production. Match whole words, not names such as
// "Roamington", and accept city prefixes/suffixes, punctuation and whitespace.
function hasRoamingName(name?: string | null): boolean {
  return (
    typeof name === "string" &&
    /(?:^|[^a-z0-9])(?:roaming|roming)(?=$|[^a-z0-9])/u.test(
      name.normalize("NFKC").trim().toLowerCase(),
    )
  );
}

export function isRoamingLocation(branch?: NamedLocation | null): boolean {
  return hasRoamingName(branch?.name) || hasRoamingName(branch?.chain?.name);
}
