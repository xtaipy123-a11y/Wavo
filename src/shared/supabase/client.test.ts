import { beforeEach, describe, expect, it } from "vitest";
import { supabaseAuthStorage } from "./client";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe("Supabase session storage", () => {
  it("moves an existing browser session out of persistent local storage", async () => {
    localStorage.setItem("wavo-supabase-auth", "old-session");
    expect(await supabaseAuthStorage.getItem("wavo-supabase-auth")).toBe("old-session");
    expect(localStorage.getItem("wavo-supabase-auth")).toBeNull();
    expect(sessionStorage.getItem("wavo-supabase-auth")).toBe("old-session");
  });

  it("removes session data from both stores at sign out", async () => {
    await supabaseAuthStorage.setItem("wavo-supabase-auth", "session");
    expect(localStorage.getItem("wavo-supabase-auth")).toBeNull();
    await supabaseAuthStorage.removeItem("wavo-supabase-auth");
    expect(sessionStorage.getItem("wavo-supabase-auth")).toBeNull();
  });
});
