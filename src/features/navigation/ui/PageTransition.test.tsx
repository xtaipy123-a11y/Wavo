import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PageTransition from "./PageTransition";

function FriendsPageStub() {
  const [, setParams] = useSearchParams();
  const [draft, setDraft] = React.useState("");
  return (
    <div>
      <button type="button" onClick={() => setDraft("draft")}>write</button>
      <button type="button" onClick={() => setParams({ sharePlaylist: "playlist-1" })}>attach</button>
      <span>{draft}</span>
    </div>
  );
}

describe("PageTransition", () => {
  let container: HTMLDivElement, root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the friends chat state when a playlist is attached", async () => {
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/friends"]}>
        <PageTransition>
          <Routes>
            <Route path="/friends" element={<FriendsPageStub />} />
          </Routes>
        </PageTransition>
      </MemoryRouter>,
    ));

    const buttons = Array.from(container.querySelectorAll("button"));
    await act(async () => buttons.find((button) => button.textContent === "write")!.click());
    expect(container.textContent).toContain("draft");

    await act(async () => buttons.find((button) => button.textContent === "attach")!.click());
    expect(container.textContent).toContain("draft");
  });
});
