import { rpc } from "@/lib/rpc";

export const listMarket = rpc("listMarket");
export const mySellables = rpc("mySellables");
export const listAvatarModels = rpc("listAvatarModels");
export const saveAvatarModel = rpc("saveAvatarModel");
export const wearAvatarModel = rpc("wearAvatarModel");
export const createMarketListing = rpc("createMarketListing");
export const buyMarketListing = rpc("buyMarketListing");
