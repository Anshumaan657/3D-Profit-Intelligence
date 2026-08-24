import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Phase 1 application shell", () => {
  it("identifies the product and its financial-integrity boundary", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /turn factory activity into financial clarity/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/without presenting estimates as audited accounts/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no client workbook is bundled/i),
    ).toBeInTheDocument();
  });
});
