import { formatUnits } from "ethers/lib/utils.js";
import { TypedData } from "vess-sdk";
import * as functions from "firebase-functions";

export const isProd = () => {
  const APP_ENV = functions.config().app.environment;
  return process.env.NODE_ENV === "production" && APP_ENV === "production";
};

export const convertDateToTimestampStr = (date: Date): string => {
  return Math.floor(date.getTime() / 1000).toString();
};

export const formatBigNumber = (value: string, decimals = "18"): string =>
  formatUnits(value, decimals);

export const convertTimestampToDateStr = (timestamp: string): string => {
  const d = new Date(Number(timestamp) * 1000);
  return formatDate(d.toISOString());
};

export const formatDate = (dateStr: string): string => {
  const d = dateStr.split("-");
  return `${d[2].split("T")[0]}-${d[1]}-${d[0]}`;
};

export const removeUndefined = <T extends Record<string, any>>(
  object: T
): T => {
  return Object.fromEntries(
    // eslint-disable-next-line no-unused-vars
    Object.entries(object).filter(([_, v]) => v !== undefined)
  ) as T;
};

export const removeUndefinedFromArray = <T>(arr: Array<T>): Array<T> => {
  return arr.filter((a) => a !== undefined);
};

export const castUndifined2DefaultValue = <T extends Record<string, any>>(
  obj: T | undefined,
  typeFormat: TypedData[]
): T => {
  if (obj === undefined) return {} as T;
  const entries = Object.entries(obj);
  let newEntries: [string, any][] = [];
  for (const t of typeFormat) {
    // eslint-disable-next-line no-unused-vars
    const e = entries.find(([k, v]) => k === t.name);
    if (e) {
      newEntries.push(e);
    } else {
      let val;
      if (t.type === "string") {
        val = "";
      } else if (t.type === "string[]") {
        val = [];
      } else if (t.type === "uint256") {
        val = 0;
      } else if (t.type === "bool") {
        val = false;
      } else {
        val = "";
      }
      newEntries.push([t.name, val]);
    }
  }
  return Object.fromEntries(newEntries) as T;
};
