"use client";

import { setupListeners } from "@reduxjs/toolkit/query/react";
import type { PropsWithChildren } from "react";
import { useEffect, useMemo } from "react";

import { Provider } from "react-redux";

import type { AppStore } from "./store";
import { getBrowserStore } from "./store";

export function StoreProvider({ children }: PropsWithChildren) {
  const store: AppStore = useMemo(() => getBrowserStore(), []);

  useEffect(() => {
    setupListeners(store.dispatch);
  }, [store]);

  return <Provider store={store}>{children}</Provider>;
}
