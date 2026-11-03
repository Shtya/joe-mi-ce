import { INATURAL_PROJECT_ID } from "../project/customer-projects";

/** Round this customer's advertised unit price before multiplying quantities. */
export function projectSaleAmount(
  projectId: string | null | undefined,
  price: number | string,
  quantity: number,
  discount: number | string,
  legacyAmount: number,
): number {
  if (projectId !== INATURAL_PROJECT_ID) return legacyAmount;
  const unitCents = Math.round(
    Number(price) * (1 - Number(discount) / 100) * 100,
  );
  return Math.round(unitCents * quantity) / 100;
}
