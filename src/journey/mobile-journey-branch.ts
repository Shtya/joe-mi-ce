import { Branch } from "entities/branch.entity";
import { requestLanguage } from "common/request-language";

/** A response-only view for older clients that unconditionally dereference branch/city. */
export function mobileJourneyBranch(
  branch: Branch | null | undefined,
  anyProjectLocation: boolean,
  language: string,
) {
  const ar = requestLanguage(language) === "ar";
  const label = anyProjectLocation
    ? ar
      ? "أي فرع في المشروع"
      : "Any project branch"
    : ar
      ? "لا يوجد فرع محدد"
      : "No assigned branch";
  const unknownLocation = ar ? "غير محدد" : "Not specified";

  if (!branch) {
    return {
      // Empty is intentional: never invent a real branch or reuse an unrelated ID.
      id: "",
      name: label,
      isDisplayOnly: true,
      city: { id: "", name: label, region: { id: "", name: label } },
    };
  }

  return {
    ...branch,
    isDisplayOnly: false,
    city: {
      ...branch.city,
      id: branch.city?.id ?? "",
      name: branch.city?.name ?? unknownLocation,
      region: {
        ...branch.city?.region,
        id: branch.city?.region?.id ?? "",
        name: branch.city?.region?.name ?? unknownLocation,
      },
    },
  };
}
