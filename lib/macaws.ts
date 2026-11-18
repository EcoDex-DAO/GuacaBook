// Scientific species IDs are stable
// across interface languages; identification is declared by the contributor.
export const macawSpecies = [
  ["Ara ararauna", "Ara bleu"],
  ["Ara glaucogularis", "Ara à gorge bleue"],
  ["Ara militaris", "Ara militaire"],
  ["Ara ambiguus", "Ara de Buffon"],
  ["Ara macao", "Ara rouge"],
  ["Ara chloropterus", "Ara chloroptère"],
  ["Ara rubrogenys", "Ara de Lafresnaye"],
  ["Ara severus", "Ara sévère"],
  ["Anodorhynchus hyacinthinus", "Ara hyacinthe"],
  ["Anodorhynchus leari", "Ara de Lear"],
  ["Anodorhynchus glaucus", "Ara glauque"],
  ["Cyanopsitta spixii", "Ara de Spix"],
  ["Primolius couloni", "Ara de Coulon"],
  ["Primolius maracana", "Ara d’Illiger"],
  ["Primolius auricollis", "Ara à collier jaune"],
  ["Orthopsittaca manilatus", "Ara macavouanne"],
  ["Diopsittaca nobilis", "Ara noble"],
] as const;
export type ParentSpecies =
  | { kind: "unknown" }
  | { kind: "species"; scientificName: string; subspecies?: string }
  | { kind: "other"; label: string; subspecies?: string }
  | { kind: "hybrid" };
export type SpeciesInfo =
  | Exclude<ParentSpecies, { kind: "hybrid" }>
  | { kind: "hybrid"; parents: [ParentSpecies, ParentSpecies]; label?: string };
export type SubspeciesTaxon = Extract<ParentSpecies, { kind: "species" | "other" }>;

export function withSubspecies(taxon: SubspeciesTaxon, value: string): SubspeciesTaxon {
  const { subspecies: previous, ...species } = taxon;
  const subspecies = value.trim();
  return subspecies ? { ...species, subspecies } : species;
}

export function declaredSubspecies(taxon?: SpeciesInfo | ParentSpecies): string | undefined {
  return taxon?.kind === "species" || taxon?.kind === "other" ? taxon.subspecies : undefined;
}

export function declaredSpecies(value: string, other: string, subspecies = ""): ParentSpecies {
  if (value === "other") return withSubspecies({ kind: "other", label: other.trim() }, subspecies);
  if (value === "hybrid") return { kind: "hybrid" };
  if (macawSpecies.some(([scientificName]) => scientificName === value))
    return withSubspecies({ kind: "species", scientificName: value }, subspecies);
  return { kind: "unknown" };
}
