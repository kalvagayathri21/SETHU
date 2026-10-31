import test from "node:test";
import assert from "node:assert/strict";
import { sampleProviders, sampleServiceCategories } from "../../src/sampleProviders.js";

test("sample-provider fixtures cover both provider types in all dashboard categories", () => {
  assert.equal(sampleServiceCategories.length, 8);
  assert.equal(sampleProviders.length, sampleServiceCategories.length * 2);

  for (const category of sampleServiceCategories) {
    const categoryProviders = sampleProviders.filter((provider) => provider.categorySlug === category.slug);
    assert.deepEqual(
      new Set(categoryProviders.map((provider) => provider.providerType)),
      new Set(["INDIVIDUAL", "BUSINESS"])
    );
  }
});

test("sample-provider fixtures satisfy provider, location, rating and service pricing requirements", () => {
  const keys = new Set();
  for (const provider of sampleProviders) {
    assert.equal(keys.has(provider.key), false);
    keys.add(provider.key);
    assert.ok(provider.name.length >= 2);
    assert.ok(provider.description.length >= 20);
    assert.ok(provider.serviceDescription.length >= 20);
    assert.match(provider.pinCode, /^\d{6}$/);
    assert.ok(provider.experienceYears >= 0 && provider.experienceYears <= 80);
    assert.ok(provider.rating >= 1 && provider.rating <= 5);
    assert.ok(Number.isInteger(provider.rating), "review ratings must fit the SMALLINT schema");
    assert.ok(provider.priceMin > 0);
    assert.ok(
      provider.priceType === "FIXED"
        ? provider.priceMax === null
        : provider.priceType === "RANGE" && provider.priceMax >= provider.priceMin
    );
    assert.ok(provider.review.length >= 2);
  }
});
