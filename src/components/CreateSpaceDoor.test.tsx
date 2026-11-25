// The create door: the kind choice it hands to its caller, and its busy state.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COPY } from "../data/copy";
import { live, resetDoubles } from "../test/sdkDouble";

vi.mock("@immediately-run/sdk", async () => (await import("../test/sdkDouble")).sdkModule);

import CreateSpaceDoor from "./CreateSpaceDoor";

beforeEach(() => {
  resetDoubles();
});

describe("CreateSpaceDoor", () => {
  it("defaults to personal", async () => {
    const onCreate = vi.fn();
    render(<CreateSpaceDoor busy={false} onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("button", { name: COPY.create }));
    expect(onCreate).toHaveBeenCalledWith("personal");
  });

  it("choosing Shared hands shared, and says what shared means", async () => {
    const onCreate = vi.fn();
    render(<CreateSpaceDoor busy={false} onCreate={onCreate} />);
    await userEvent.click(screen.getByRole("radio", { name: COPY.kindShared }));
    expect(screen.getByText(COPY.sharedNote)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: COPY.create }));
    expect(onCreate).toHaveBeenCalledWith("shared");
  });

  it("stays on screen while busy, named and disabled", () => {
    render(<CreateSpaceDoor busy onCreate={() => {}} />);
    const button = screen.getByRole("button", { name: COPY.creating });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("two doors keep separate kind choices", async () => {
    render(
      <>
        <CreateSpaceDoor busy={false} onCreate={() => {}} />
        <CreateSpaceDoor busy={false} onCreate={() => {}} />
      </>,
    );
    const shared = screen.getAllByRole("radio", { name: COPY.kindShared });
    await userEvent.click(shared[0]);
    const personal = screen.getAllByRole("radio", { name: COPY.kindPersonal });
    expect(personal[1]).toBeChecked();
  });

  it("is absent while signed out", () => {
    live.auth = "signed-out";
    const { container } = render(<CreateSpaceDoor busy={false} onCreate={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
