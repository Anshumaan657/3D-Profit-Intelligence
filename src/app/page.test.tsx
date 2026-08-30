import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Phase 2 workbook importer", () => {
  it("explains the local import and quantity-integrity boundaries", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /start with your mms workbook/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: /bring your mms evidence into focus/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/reported qty is authoritative/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/choose workbook/i)).toHaveAttribute(
      "accept",
      expect.stringContaining(".xlsx"),
    );
  });
});
