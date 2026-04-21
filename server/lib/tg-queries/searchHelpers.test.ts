import { describe, expect, it } from "vitest";
import { classifyQuery, containsLink, highlightSnippet, snippetFromText } from "./searchHelpers";

describe("searchHelpers", () => {
  it("classifies username handles", () => {
    expect(classifyQuery("@openai")).toEqual({
      query: "@openai",
      isHandle: true,
      isNumeric: false,
    });
  });

  it("classifies numeric telegram ids", () => {
    expect(classifyQuery("123456789")).toEqual({
      query: "123456789",
      isHandle: false,
      isNumeric: true,
    });
  });

  it("builds centered snippets around a match", () => {
    const snippet = snippetFromText("zero one two three four five", "three", 12);
    expect(snippet.toLowerCase()).toContain("three");
  });

  it("escapes html before highlighting", () => {
    const highlighted = highlightSnippet("<script>alert(1)</script> hello", "hello");
    expect(highlighted).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(highlighted).toContain("<mark>hello</mark>");
  });

  it("detects message links", () => {
    expect(containsLink("check https://example.com now")).toBe(true);
    expect(containsLink("no links here")).toBe(false);
  });
});
