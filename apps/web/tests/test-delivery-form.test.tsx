import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import {
  TestDeliveryForm,
  type TestDestination,
} from "../src/components/test-delivery-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
afterEach(() => vi.restoreAllMocks());

function destination(
  id: string,
  name: string,
  eventTypes: string[],
): TestDestination {
  return {
    id,
    name,
    sources: [{ id: "shop", name: "Online store", eventTypes }],
  };
}

function render(destinations: TestDestination[]) {
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected network request"));
  const html = renderToStaticMarkup(
    <TestDeliveryForm
      organizationId="shop-team"
      destinations={destinations}
      chooseDestination
    />,
  );
  expect(request).not.toHaveBeenCalled();
  return html;
}

it("requires an explicit destination choice when more than one route is available", () => {
  const html = render([
    destination("warehouse", "Warehouse", ["order.created"]),
    destination("billing", "Billing", ["payment.paid"]),
  ]);
  expect(html).toContain(">Warehouse</option>");
  expect(html).toContain(">Billing</option>");
  expect(html).toMatch(
    /<option[^>]*selected=""[^>]*>Choose a destination<\/option>/,
  );
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Send test<\/button>/);
  expect(html).not.toContain('name="sourceId"');
});

it("prepares a lone destination with only its configured event types", () => {
  const html = render([
    destination("warehouse", "Warehouse", ["order.created", "order.returned"]),
  ]);
  expect(html).toMatch(/<option[^>]*selected=""[^>]*>Warehouse<\/option>/);
  expect(html).toContain('name="sourceId"');
  expect(html).toMatch(/<select[^>]*name="eventType"[^>]*>/);
  expect(html).toContain(">order.created</option>");
  expect(html).toContain(">order.returned</option>");
  expect(html).not.toMatch(/<button[^>]*disabled/);
});

it("lets a source with an unrestricted route use a custom test event type", () => {
  const html = render([destination("warehouse", "Warehouse", [""])]);
  expect(html).toMatch(/<input[^>]*name="eventType"[^>]*>/);
  expect(html).toContain('value="relayhub.test"');
  expect(html).not.toMatch(/<button[^>]*disabled/);
});
