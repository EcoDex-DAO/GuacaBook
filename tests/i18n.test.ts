import { test } from "node:test";
import assert from "node:assert/strict";
import { dictionaries, detectLocale, isLocale, translate } from "../lib/i18n";
test("détecte les langues régionales et respecte l’ordre du navigateur", () => {
  assert.equal(detectLocale(["de-DE", "pt-BR", "en"]), "pt");
  assert.equal(detectLocale(["es-MX", "fr"]), "es");
  assert.equal(detectLocale(["fr-CA"]), "fr");
  assert.equal(detectLocale(["ja"]), "en");
  assert.equal(isLocale("constructor"), false);
});
test("les catalogues ont les mêmes clés, valeurs et paramètres", () => {
  const keys = Object.keys(dictionaries.en).sort();
  for (const language of ["en", "es", "pt"] as const) {
    assert.deepEqual(Object.keys(dictionaries[language]).sort(), keys);
    for (const [key, value] of Object.entries(dictionaries[language])) {
      assert.ok(value.trim(), `${language}: ${key}`);
      const params = (s: string) => (s.match(/\{\w+\}/g) || []).sort();
      assert.deepEqual(params(value), params(key), `${language}: ${key}`);
    }
  }
});
test("interpôle les données utilisateur sans les traduire ni les interpréter", () => {
  assert.equal(
    translate("en", "Les photos de {name}.", { name: "L’œil {name} <script>" }),
    "Photos of L’œil {name} <script>.",
  );
  assert.equal(
    translate("es", "Supprimer l’annotation {number}", { number: 2 }),
    "Eliminar anotación 2",
  );
  assert.equal(
    translate("fr", "Les photos de {name}.", { name: "Kiwi" }),
    "Les photos de Kiwi.",
  );
});
