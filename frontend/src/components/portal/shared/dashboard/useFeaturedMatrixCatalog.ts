"use client";

import { useMemo } from "react";
import { useListProductGroupsQuery, useListProductsQuery } from "@/store/api";
import {
  buildFeaturedGroupProductMaps,
  pickEntities,
  type MatrixEntity,
} from "./featuredMatrixUtils";

export interface FeaturedMatrixCatalog {
  featuredGroups: MatrixEntity[];
  productToGroupMap: Map<string, string>;
  productsByGroup: Map<string, MatrixEntity[]>;
  isCatalogFetching: boolean;
}

export function useFeaturedMatrixCatalog(options?: {
  enabled?: boolean;
}): FeaturedMatrixCatalog {
  const enabled = options?.enabled ?? true;

  const { data: groupsData, isFetching: isGroupsFetching } =
    useListProductGroupsQuery(
      {
        is_featured: "true",
        status: "active",
        limit: 1000,
      },
      { skip: !enabled },
    );

  const { data: productsData, isFetching: isProductsFetching } =
    useListProductsQuery(
      {
        status: "active",
      },
      { skip: !enabled },
    );

  const featuredGroups = useMemo<MatrixEntity[]>(() => {
    return pickEntities(groupsData)
      .filter((g) => g.is_featured === true || g.is_featured === "true")
      .map((g) => ({
        id: String(g._id ?? g.id ?? ""),
        name: String(g.name ?? "Untitled Group"),
      }))
      .filter((g) => g.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groupsData]);

  const { productToGroupMap, productsByGroup } = useMemo(
    () => buildFeaturedGroupProductMaps(productsData, featuredGroups),
    [productsData, featuredGroups],
  );

  return {
    featuredGroups,
    productToGroupMap,
    productsByGroup,
    isCatalogFetching: isGroupsFetching || isProductsFetching,
  };
}
