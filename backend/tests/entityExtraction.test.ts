import { describe, expect, test } from "bun:test";
import { extractEntitiesFromText, extractGraphFactsFromText } from "../services/entityExtraction";

describe("extractGraphFactsFromText", () => {
  test("extracts typed USES relation from generic domain text", () => {
    const text = "Workshop uses Toolkit for Furniture repairs.";
    const result = extractGraphFactsFromText(text);

    expect(result.entities.length).toBeGreaterThan(1);
    expect(result.relations.some((r) => r.type === "USES")).toBeTrue();
    expect(
      result.relations.some(
        (r) => r.type === "USES" && r.source.includes("workshop") && r.target.includes("toolkit")
      )
    ).toBeTrue();
  });

  test("falls back to RELATED_TO when no explicit cue is found", () => {
    const text = "Gardening and Cooking appear together in the journal.";
    const result = extractGraphFactsFromText(text);

    expect(result.relations.length).toBeGreaterThan(0);
    expect(result.relations.some((r) => r.type === "RELATED_TO")).toBeTrue();
  });

  test("extracts PART_OF relation for generic hierarchy phrasing", () => {
    const text = "Engine is part of Vehicle assembly.";
    const result = extractGraphFactsFromText(text);

    expect(result.relations.some((r) => r.type === "PART_OF")).toBeTrue();
    expect(
      result.relations.some(
        (r) =>
          r.type === "PART_OF" &&
          r.source.includes("engine") &&
          r.target.includes("vehicle")
      )
    ).toBeTrue();
  });

  test("extracts ABOUT relation with generic subject and topic", () => {
    const text = "Report discusses Traffic and Safety guidelines.";
    const result = extractGraphFactsFromText(text);

    expect(
      result.relations.some(
        (r) =>
          r.type === "ABOUT" &&
          r.source.includes("report") &&
          (r.target.includes("traffic") || r.target.includes("safety"))
      )
    ).toBeTrue();
  });

  test("filters generic low-signal entities", () => {
    const text =
      "This project contains notes, topics, examples, and methods. The project discusses methods and examples.";
    const entities = extractEntitiesFromText(text);

    expect(entities.some((entity) => entity.name.toLowerCase() === "project")).toBeFalse();
    expect(entities.some((entity) => entity.name.toLowerCase() === "notes")).toBeFalse();
  });

  test("does not fully connect every entity in fallback mode", () => {
    const text = "Alpha beta gamma delta epsilon zeta.";
    const result = extractGraphFactsFromText(text, 6);

    expect(result.relations.length).toBeLessThan(10);
  });

  test("extracts typed relations across mixed domains", () => {
    const cases: Array<{
      text: string;
      expectedType: "USES" | "ABOUT" | "PART_OF";
      sourceHint: string;
      targetHint: string;
    }> = [
      {
        text: "Clinic uses Ultrasound for diagnosis.",
        expectedType: "USES",
        sourceHint: "clinic",
        targetHint: "ultrasound",
      },
      {
        text: "Court report discusses Contract disputes.",
        expectedType: "ABOUT",
        sourceHint: "report",
        targetHint: "contract",
      },
      {
        text: "Engine is part of Vehicle assembly.",
        expectedType: "PART_OF",
        sourceHint: "engine",
        targetHint: "vehicle",
      },
      {
        text: "Factory uses Conveyor for packaging.",
        expectedType: "USES",
        sourceHint: "factory",
        targetHint: "conveyor",
      },
    ];

    for (const c of cases) {
      const result = extractGraphFactsFromText(c.text);
      expect(
        result.relations.some(
          (r) =>
            r.type === c.expectedType &&
            r.source.includes(c.sourceHint) &&
            r.target.includes(c.targetHint)
        )
      ).toBeTrue();
    }
  });

  test("handles casing and punctuation noise in relation cues", () => {
    const cases = [
      "WORKSHOP, uses TOOLKIT!!!",
      "REPORT discusses Traffic!!!",
      "Engine -- part of -- Vehicle.",
    ];

    const results = cases.map((text) => extractGraphFactsFromText(text));

    expect(results[0]?.relations.some((r) => r.type === "USES")).toBeTrue();
    expect(results[1]?.relations.some((r) => r.type === "ABOUT")).toBeTrue();
    expect(results[2]?.relations.some((r) => r.type === "PART_OF")).toBeTrue();
  });
});
