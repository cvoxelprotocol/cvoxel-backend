/* eslint-disable @typescript-eslint/no-var-requires */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { recoverPersonalSignature } from "@metamask/eth-sig-util";
// import * as sgMail from "@sendgrid/mail";
import BigNumber from "bignumber.js";
import fetch from "node-fetch";
import { formatUnits } from "@ethersproject/units";
import { toUtf8Bytes } from "@ethersproject/strings";
import { hexlify } from "@ethersproject/bytes";

let FB_CREDENTIAL;
let FB_DATABASE_URL;

const APP_ENV = functions.config().app.environment;
const ETHERSCAN_API_KEY = functions.config().apikey.etherscan;
const POLYGON_API_KEY = functions.config().apikey.polygon;

if (process.env.NODE_ENV === "production" && APP_ENV === "production") {
  FB_CREDENTIAL = require("./service-account-key-prod.json");
  FB_DATABASE_URL = "https://cvoxel-testnet.firebaseio.com";
} else {
  FB_CREDENTIAL = require("./service-account-key-staging.json");
  FB_DATABASE_URL = "https://escrow-dev-3d429.firebaseapp.com";
}

admin.initializeApp({
  credential: admin.credential.cert(FB_CREDENTIAL),
  databaseURL: FB_DATABASE_URL,
});

const db = admin.firestore();

type CVoxel = {
  to: string; // payee address. maybe contract address
  from: string; // payer address. maybe contract address
  isPayer: boolean; // whether owner is payer or not
  summary: string; // work summary
  detail?: string; // work detail
  deliverables?: DeliverableItem[]; // deliberable link
  value: string; // reward value
  tokenSymbol: string; // eth, usdc, etc
  tokenDecimal: number;
  fiatValue?: string; // reward value as USD
  fiatSymbol?: string; // currently only USD supported
  networkId: number; // eth mainnet = 1 | polygon mainnet = 137
  issuedTimestamp: string; // block timestamp
  txHash: string; // transfer tx hash
  deliverableHash?: string; // hash value of all work descriptions(summary, detail, deliverables)
  platform?: string; // a transaction platform if exists e.g, gitcoin
  relatedTxHashes?: string[]; // tx releated work
  tags?: string[]; // tags
  genre?: string; // main genre
  jobType: "FullTime" | "PartTime" | "OneTime"; // default=OneTime
  toSig: string; // sig of payee
  fromSig: string; // sig of payer
  toSigner: string; // who signed this cvoxel as payee actually. Only EOA supported
  fromSigner: string; // who signed this cvoxel as payer actually. Only EOA supported
  startTimestamp?: string; // timestamp to start work
  endTimestamp?: string; // timestamp to end work
  subtasks?: Subtask[];
  createdAt?: string; // timestamp to be created
  updatedAt?: string; // timestamp to be updated
  relatedAddresses: string[]; // all addresses related to this cvoxel. may contain both EOA and contract address
};

type DeliverableItem = {
  type: string;
  value: string;
};

type Subtask = {
  detail: string;
  genre: string;
};

type CVoxelMetaDraft = CVoxel & {
  potencialPayer?: string[]; // in case of multisig wallet
  completed?: boolean; // whether or not work is completed (only in case of LanC., it might be false)
};

type CoinGeckoIdType = {
  id: string;
};

type CoinGeckoListType = {
  [x: string]: CoinGeckoIdType;
};

type TransactionLog = {
  blockHash: string;
  blockNumber: string;
  confirmations: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  from: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  hash: string;
  input: string;
  isError: string;
  nonce: string;
  timeStamp: string;
  to: string;
  transactionIndex: string;
  // eslint-disable-next-line camelcase
  txreceipt_status: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
};

type TransactionLogWithChainId = TransactionLog & {
  chainId: number;
};

type EtherscanResult = {
  status: string;
  message: string;
  result: TransactionLog[];
};

// =======Main Function=======
export const createWCDraftWighVerify = functions.https.onCall(
  async (data: any) => {
    if (!data.draft || !data.address) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "you must include address and signature"
      );
    }

    try {
      const draft = data.draft as CVoxelMetaDraft;
      const address = data.address as string;

      const isPayee: boolean = address.toLowerCase() === draft.to.toLowerCase();

      const signature = isPayee ? draft.toSig : draft.fromSig;
      const deliverable = draft.deliverables
        ? draft.deliverables.map((d) => d.value).join(",")
        : undefined;
      const message = getMessageForSignatureV2(
        draft.txHash,
        address.toLowerCase(),
        draft.summary,
        draft.detail,
        deliverable
      );

      console.log("message", JSON.stringify(message));

      const dataBytes =
        typeof message === "string" ? toUtf8Bytes(message) : message;

      // Recover the address of the account used to create the given Ethereum signature.
      const recoveredAddress = recoverPersonalSignature({
        data: hexlify(dataBytes),
        signature: signature,
      });

      console.log("recoveredAddress", recoveredAddress);
      console.log("address", address.toLowerCase());
      console.log("signature", signature);

      if (recoveredAddress.toLowerCase() === address.toLowerCase()) {
        // add fiat value
        const fiat = await getFiatValue(
          draft.value,
          draft.tokenSymbol,
          draft.tokenDecimal ? draft.tokenDecimal.toString() : "18",
          draft.issuedTimestamp
        );
        const cvoxelMeta: CVoxel = {
          ...draft,
          fiatValue: fiat,
          fiatSymbol: "USD",
        };

        const cVoxelDocRef = db
          .collection("cvoxels")
          .doc(`${draft.networkId}_${draft.txHash}`);
        const cVoxelDoc = await cVoxelDocRef.get();
        if (!cVoxelDoc.exists) {
          await cVoxelDocRef.set(cvoxelMeta);
        } else {
          await cVoxelDocRef.update(cvoxelMeta);
        }
        return { status: "ok", fiat: fiat };
      } else {
        throw new functions.https.HttpsError(
          "permission-denied",
          "signature is not valid"
        );
      }
    } catch (err) {
      console.log("error", err);
      throw new functions.https.HttpsError(
        "unknown",
        "The function must be called while authenticated."
      );
    }
  }
);

export const createDraftWighVerify = functions.https.onCall(
  async (data: any) => {
    if (!data.draft || !data.address) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "you must include address and signature"
      );
    }

    try {
      const draft = data.draft as CVoxelMetaDraft;
      const address = data.address as string;

      const isPayee: boolean = address.toLowerCase() === draft.to.toLowerCase();

      const signature = isPayee ? draft.toSig : draft.fromSig;
      const deliverable = draft.deliverables
        ? draft.deliverables.map((d) => d.value).join(",")
        : undefined;
      const message = getMessageForSignature(
        draft.txHash,
        address.toLowerCase(),
        draft.summary,
        draft.detail,
        deliverable
      );

      console.log("message", JSON.stringify(message));

      const dataBytes =
        typeof message === "string" ? toUtf8Bytes(message) : message;

      // Recover the address of the account used to create the given Ethereum signature.
      const recoveredAddress = recoverPersonalSignature({
        data: hexlify(dataBytes),
        signature: signature,
      });

      console.log("recoveredAddress", recoveredAddress);
      console.log("address", address.toLowerCase());
      console.log("signature", signature);

      if (recoveredAddress.toLowerCase() === address.toLowerCase()) {
        // add fiat value
        const fiat = await getFiatValue(
          draft.value,
          draft.tokenSymbol,
          draft.tokenDecimal ? draft.tokenDecimal.toString() : "18",
          draft.issuedTimestamp
        );
        const cvoxelMeta: CVoxel = {
          ...draft,
          fiatValue: fiat,
          fiatSymbol: "USD",
        };

        const cVoxelDocRef = db
          .collection("cvoxels")
          .doc(`${draft.networkId}_${draft.txHash}`);
        const cVoxelDoc = await cVoxelDocRef.get();
        if (!cVoxelDoc.exists) {
          await cVoxelDocRef.set(cvoxelMeta);
        } else {
          await cVoxelDocRef.update(cvoxelMeta);
        }
        return { status: "ok", fiat: fiat };
      } else {
        throw new functions.https.HttpsError(
          "permission-denied",
          "signature is not valid"
        );
      }
    } catch (err) {
      console.log("error", err);
      throw new functions.https.HttpsError(
        "unknown",
        "The function must be called while authenticated."
      );
    }
  }
);

export const updateDraftWighVerify = functions.https.onCall(
  async (data: any) => {
    try {
      // if (!data.signature || !data.address || !data.hash || !data.networkId) {
      //   throw new functions.https.HttpsError(
      //     "failed-precondition",
      //     "you must include address, signature, hash, networkId"
      //   );
      // }

      const signature = data.signature as string;
      const addressVal = data.address as string;
      const hash = data.hash as string;
      const networkId = data.networkId as string;

      const address = addressVal.toLowerCase();

      const cVoxelDocRef = db.collection("cvoxels").doc(`${networkId}_${hash}`);
      const draftDoc = await cVoxelDocRef.get();

      if (!draftDoc.exists) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "there is no cvoxel"
        );
      }

      const draft = draftDoc.data() as CVoxelMetaDraft;

      const isPayee: boolean = address === draft.to.toLowerCase();
      if (isPayee) {
        await cVoxelDocRef.update({
          toSig: signature,
          toSigner: address,
        });
      } else {
        await cVoxelDocRef.update({
          fromSig: signature,
          fromSigner: address,
        });
      }
      return { status: "ok" };

      // const deliverable = draft.deliverables
      //   ? draft.deliverables.map((d) => d.value).join(",")
      //   : undefined;
      // const message = getMessageForSignature(
      //   draft.txHash,
      //   address,
      //   draft.summary,
      //   draft.detail,
      //   deliverable
      // );

      // const dataBytes =
      //   typeof message === "string" ? toUtf8Bytes(message) : message;

      // Recover the address of the account used to create the given Ethereum signature.
      // const recoveredAddress = recoverPersonalSignature({
      //   data: hexlify(dataBytes),
      //   signature: signature,
      // });

      // console.log("recoveredAddress", recoveredAddress);
      // console.log("address", address.toLowerCase());
      // console.log("signature", signature);

      // if (recoveredAddress === address) {
      //   const isPayee: boolean = address === draft.to.toLowerCase();
      //   if (isPayee) {
      //     await cVoxelDocRef.update({
      //       toSig: signature,
      //       toSigner: address,
      //     });
      //   } else {
      //     await cVoxelDocRef.update({
      //       fromSig: signature,
      //       fromSigner: address,
      //     });
      //   }
      //   return { status: "ok" };
      // } else {
      //   console.log("signature is not valid");
      //   throw new functions.https.HttpsError(
      //     "permission-denied",
      //     "signature is not valid"
      //   );
      // }
    } catch (err) {
      console.log(err);
      throw new functions.https.HttpsError(
        "unknown",
        "The function must be called while authenticated."
      );
    }
  }
);

export const setFiat = functions.https.onCall(async (data: any) => {
  try {
    const { networkId, txHash } = data;
    if (!(networkId && txHash)) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "you must include networkId, txHash"
      );
    }

    const cVoxelDocRef = db.collection("cvoxels").doc(`${networkId}_${txHash}`);
    const draftDoc = await cVoxelDocRef.get();

    if (!draftDoc.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "draft doc does not exist"
      );
    }

    const draft = draftDoc.data() as CVoxelMetaDraft;

    const fiat = await getFiatValue(
      draft.value,
      draft.tokenSymbol,
      draft.tokenDecimal ? draft.tokenDecimal.toString() : "18",
      draft.issuedTimestamp
    );
    draft;
    await cVoxelDocRef.update({ fiatValue: fiat, fiatSymbol: "USD" });
    return { status: "ok", fiat: fiat };
  } catch (err) {
    throw new functions.https.HttpsError(
      "unknown",
      "The function must be called while authenticated."
    );
  }
});

export const getFiat = functions.https.onCall(async (data: any) => {
  try {
    const { value, tokenSymbol, tokenDecimal, issuedTimestamp } = data;
    if (!(value && tokenSymbol && tokenDecimal && issuedTimestamp)) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "you must include value, tokenSymbol, tokenDecimal, issuedTimestamp"
      );
    }

    const fiat = await getFiatValue(
      value,
      tokenSymbol,
      tokenDecimal,
      issuedTimestamp
    );
    return { status: "ok", fiat: fiat };
  } catch (err) {
    console.log(err);
    throw new functions.https.HttpsError(
      "unknown",
      "The function must be called while authenticated."
    );
  }
});

export const getTransactions = functions.https.onCall(async (data: any) => {
  try {
    const { address } = data;
    if (!address) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "you must include address, chainIds, tokenDecimal, issuedTimestamp"
      );
    }
    try {
      const [tokenEth, txEth, tokenPol, txPol] = await Promise.all([
        getTransactionsFromExlore("tokentx", 1, address),
        getTransactionsFromExlore("txlist", 1, address),
        getTransactionsFromExlore("tokentx", 137, address),
        getTransactionsFromExlore("txlist", 137, address),
      ]);
      const results: TransactionLogWithChainId[] = tokenEth
        .concat(txEth)
        .concat(tokenPol)
        .concat(txPol);
      return { status: "ok", tx: results };
    } catch (error) {
      return { status: "ng", tx: [] };
    }
  } catch (err) {
    console.log(err);
    throw new functions.https.HttpsError(
      "unknown",
      "The function must be called while authenticated."
    );
  }
});

export const getInternalTransactions = functions.https.onCall(
  async (data: any) => {
    try {
      const { txHash, chainId } = data;
      if (!(txHash && chainId)) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "you must include txhash"
        );
      }
      try {
        const results: TransactionLogWithChainId[] =
          await getTransactionsFromExlore(
            "txlistinternal",
            Number(chainId),
            undefined,
            undefined,
            txHash
          );
        return { status: "ok", tx: results };
      } catch (error) {
        return { status: "ng", tx: [] };
      }
    } catch (err) {
      console.log(err);
      throw new functions.https.HttpsError(
        "unknown",
        "The function must be called while authenticated."
      );
    }
  }
);

// =======Main Function=======

// =======Utils=======
const getTransactionsFromExlore = async (
  action: string,
  chainId: number,
  address?: string,
  contractaddress?: string,
  txHash?: string
): Promise<TransactionLogWithChainId[]> => {
  try {
    const url = etherscanManager(
      "account",
      action,
      chainId,
      address,
      contractaddress,
      txHash
    );
    const res = await fetch(url);
    const resJson = (await res.json()) as EtherscanResult;
    const results: TransactionLogWithChainId[] = resJson.result.map((res) => {
      return {
        ...res,
        chainId: Number(chainId),
      } as TransactionLogWithChainId;
    });
    return resJson.status === "1" ? results : [];
  } catch (error) {
    console.log("error", error);
    return [];
  }
};

const etherscanManager = (
  module: string,
  action: string,
  chainId: number,
  address?: string,
  contractaddress?: string,
  txhash?: string,
  page = 1,
  offset = 0
): string => {
  let url;
  if (chainId === 1) {
    url = `https://api.etherscan.io/api?apikey=${ETHERSCAN_API_KEY}`;
  } else if (chainId === 137) {
    url = `https://api.polygonscan.com/api?apikey=${POLYGON_API_KEY}`;
  } else {
    url = `https://api-rinkeby.etherscan.io/api?apikey=${ETHERSCAN_API_KEY}`;
  }
  let baseUrl = "";
  if (txhash) {
    baseUrl = `${url}&module=${module}&action=${action}&txhash=${txhash}&sort=desc`;
  } else {
    baseUrl = `${url}&module=${module}&action=${action}&address=${address}&sort=desc`;
  }
  if (contractaddress)
    baseUrl = `${baseUrl}&contractaddress=${contractaddress}`;
  if (page && offset) baseUrl = `${baseUrl}&offset=${offset}&page=${page}`;

  return baseUrl;
};

const getFiatValue = async (
  value: string,
  tokenSymbol: string,
  tokenDecimal: string,
  issuedTimestamp: string
): Promise<string> => {
  const data = require("./coinGeckoPiarList.json");
  const coinGeckoList = data as CoinGeckoListType;

  const token = coinGeckoList[tokenSymbol.toLowerCase()]
    ? coinGeckoList[tokenSymbol.toLowerCase()].id
    : "";
  if (token !== "") {
    const date = convertTimestampToDateStr(issuedTimestamp);
    const url = `https://api.coingecko.com/api/v3/coins/${token}/history?date=${date}&localization=en`;
    try {
      const res = await fetch(url);
      const resJson = (await res.json()) as any;
      const usdUnit = resJson["market_data"]["current_price"]["usd"]
        ? (resJson["market_data"]["current_price"]["usd"] as string)
        : "";

      const val = new BigNumber(formatBigNumber(value, tokenDecimal));
      const usd = new BigNumber(usdUnit);
      const usdVal = val.times(usd);

      return usdVal.toString();
    } catch (error) {
      console.log("error", error);
      return "";
    }
  }
  return "";
};

const formatBigNumber = (value: string, decimals = "18"): string =>
  formatUnits(value, decimals);

const convertTimestampToDateStr = (timestamp: string): string => {
  const d = new Date(Number(timestamp) * 1000);
  return formatDate(d.toISOString());
};

const formatDate = (dateStr: string): string => {
  const d = dateStr.split("-");
  return `${d[2].split("T")[0]}-${d[1]}-${d[0]}`;
};

// send mail
// const sendMail = async (
//   messageData: any,
//   templateId: string,
//   email: string
// ) => {
//   sgMail.setApiKey(functions.config().sendgrid.apikey);

//   const msg = {
//     to: email,
//     from: "info@lanc.app",
//     replyTo: "info@lanc.app",
//     templateId: templateId,
//     dynamic_template_data: messageData,
//   };
//   try {
//     await sgMail.send(msg);
//   } catch (error) {
//     console.error(error);
//   }
// };

const getMessageForSignature = (
  txHash: string,
  txAddress: string,
  summary: string,
  description?: string,
  deliverable?: string
): string => {
  return `Claim C-Voxel for work detail below\n\nsummary: ${summary}\ndescription: ${
    description ?? ""
  }\ndeliverable: ${
    deliverable ?? ""
  }\ntxHash: ${txHash}\naddress: ${txAddress}`;
};

const getMessageForSignatureV2 = (
  txHash: string,
  txAddress: string,
  summary: string,
  description?: string,
  deliverable?: string
): string => {
  return `Claim Work Credential\n\nsummary: ${summary}\ndescription: ${
    description ?? ""
  }\ndeliverable: ${
    deliverable ?? ""
  }\ntxHash: ${txHash}\naddress: ${txAddress}`;
};
// =======Utils=======
