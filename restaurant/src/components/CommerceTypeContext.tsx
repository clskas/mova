"use client";

import { createContext, useContext } from "react";
import { commerceCopy, type CommerceCopy, type CommerceType } from "@/lib/commerce-type";

const CommerceTypeContext = createContext<CommerceType>("RESTAURANT");

export function CommerceTypeProvider({
  commerceType,
  children,
}: {
  commerceType: CommerceType;
  children: React.ReactNode;
}) {
  return (
    <CommerceTypeContext.Provider value={commerceType}>{children}</CommerceTypeContext.Provider>
  );
}

export function useCommerceType(): CommerceType {
  return useContext(CommerceTypeContext);
}

export function useCommerceCopy(): CommerceCopy {
  return commerceCopy(useContext(CommerceTypeContext));
}
