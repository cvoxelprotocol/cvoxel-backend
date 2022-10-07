/* eslint-disable @typescript-eslint/no-var-requires */
import * as functions from "firebase-functions";
// import * as admin from "firebase-admin";
// import { recoverPersonalSignature } from "@metamask/eth-sig-util";
// import sgMail from "@sendgrid/mail";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fetch from "node-fetch";
import { toUtf8Bytes } from "@ethersproject/strings";
import { hexlify } from "@ethersproject/bytes";
import { recoverPersonalSignature } from "@metamask/eth-sig-util";
import { FunctionsErrorCode } from "firebase-functions/v1/https";
import { CVoxelMetaDraft } from "./types/cVoxel.js";
import { UserConnection } from "./types/user.js";
import { Task } from "./types.js";
import sgMail from "@sendgrid/mail";
import {
  convertTimestampToDateStr,
  formatBigNumber,
} from "./utils/commonUtil.js";
import { DeworkOrg } from "./types/Orgs.js";
import {
  WorkCredentialWithId,
  WorkSubjectFromDework,
} from "./types/workCredential.js";
import { Signatures } from "./__generated__/types/workCredential.js";
import { createOrganization } from "./utils/ceramicHelper.js";
import { issueWorkCRDLsFromDework } from "./services/WorkCredentialService.js";
import {
  covnertTask2WorkSubject,
  getDeworkTasks,
  getDeworkUserInfo,
} from "./utils/deworkHelper.js";
import { createRequire } from "module";
import {
  EtherscanResult,
  TransactionLogWithChainId,
} from "./types/TransactionLog.js";
// import { BigNumber } from "bignumber.js";
import pkg from "bignumber.js";
const { BigNumber } = pkg;
const require = createRequire(import.meta.url);
// import * as ProdKey from "./service-account-key-prod.json" assert { type: "json" };
// import * as DevKey from "./service-account-key-prod.json" assert { type: "json" };

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
  FB_DATABASE_URL = "https://cvoxel-dev.firebaseio.com";
}

initializeApp({
  credential: cert(FB_CREDENTIAL),
  databaseURL: FB_DATABASE_URL,
});

const db = getFirestore();

type CoinGeckoIdType = {
  id: string;
};

type CoinGeckoListType = {
  [x: string]: CoinGeckoIdType;
};

// =======Main Function=======
// upload CRDL
export const uploadCRDL = functions.https.onCall(async (data: any) => {
  if (!data.crdl) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "you must include crdl"
    );
  }

  try {
    const crdl = data.crdl as WorkCredentialWithId;
    const sig: Signatures = {
      partnerSig: crdl.signature?.partnerSig || "",
      partnerSigner: crdl.signature?.partnerSigner || "",
      agentSig: crdl.signature?.agentSig || "",
      agentSigner: crdl.signature?.agentSigner || "",
      holderSig: crdl.signature?.holderSig || "",
    };
    const crdlWithNull: WorkCredentialWithId = {
      ...crdl,
      signature: sig,
    };
    const cRDLDocRef = db.collection("credentials").doc(`${crdl.backupId}`);
    await cRDLDocRef.set(crdlWithNull, { merge: true });
    return { status: "ok" };
  } catch (err) {
    console.log("error", err);
    throw new functions.https.HttpsError(
      "unknown",
      "The function must be called while authenticated."
    );
  }
});

export const uploadDraft = functions.https.onCall(async (data: any) => {
  if (!data.draft) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "you must include draft"
    );
  }

  try {
    const draft = data.draft as CVoxelMetaDraft;
    const cVoxelDocRef = db
      .collection("cvoxels")
      .doc(`${draft.networkId}_${draft.txHash}`);
    await cVoxelDocRef.set(draft, { merge: true });
    return { status: "ok" };
  } catch (err) {
    console.log("error", err);
    throw new functions.https.HttpsError(
      "unknown",
      "The function must be called while authenticated."
    );
  }
});

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

export const deworkAuth = functions.https.onCall(async (data: any) => {
  try {
    const { name, sig, nonce, address } = data;
    if (!(name && sig && nonce && address)) {
      errorResponse("failed-precondition", "you must include txhash");
      return;
    }
    try {
      // validation
      const message = getDeworkAuthMessage(nonce);
      const dataBytes =
        typeof message === "string" ? toUtf8Bytes(message) : message;

      // Recover the address of the account used to create the given Ethereum signature.
      const recoveredAddress = recoverPersonalSignature({
        data: hexlify(dataBytes),
        signature: sig,
      });
      if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        errorResponse("unauthenticated", "SIG_MISMATCH");
        return;
      }

      // fetch from Firestore
      const connectionDocRef = db.collection("connections").doc(address);
      const connectionDoc = await connectionDocRef.get();
      if (connectionDoc.exists) {
        console.log("data exists");
        const data = connectionDoc.data() as UserConnection;
        return { status: "ok", dework: data.dework };
      }

      // fetch from dework
      const userInfo = await getDeworkUserInfo(name);
      console.log({ userInfo });

      if (!userInfo) {
        errorResponse("unauthenticated", "ADDRESS_MISSING");
        return;
      }

      if (userInfo.address.toLowerCase() !== address.toLowerCase()) {
        errorResponse("unauthenticated", "ADDRESS_NOT_MATCHED");
        return;
      }

      const connection: UserConnection = {
        address: address,
        dework: userInfo,
      };

      await connectionDocRef.set(connection, { merge: true });
      return { status: "ok", dework: userInfo };
    } catch (error) {
      return { status: "ng", tx: null };
    }
  } catch (err) {
    console.log(err);
    throw new functions.https.HttpsError(
      "unknown",
      "The function must be called while authenticated."
    );
  }
});

export const getDeworkUserTasks = functions
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB",
  })
  .https.onCall(async (data: any) => {
    try {
      const { address, id } = data;
      if (!address) {
        errorResponse("failed-precondition", "you must include txhash");
        return;
      }
      try {
        let tasks: Task[] = [];
        const subjects: WorkSubjectFromDework[] = [];
        // from id param
        if (id) {
          tasks = await getDeworkTasks(id);
          // WIP
        } else if (address) {
          const connectionDocRef = db
            .collection("connections")
            .where("address", "==", address);
          const res = await connectionDocRef.get();
          const { dework } = res.docs[0].data() as UserConnection;

          tasks = await getDeworkTasks(dework.id);
        }

        if (tasks && tasks.length > 0) {
          const deworkTasksRef = db
            .collection("deworkTasks")
            .doc(address)
            .collection("tasks");
          const batch = db.batch();
          const orgsArr: DeworkOrg[] = [];

          for (const task of tasks) {
            // get client info
            let org: DeworkOrg | null = null;
            const deworkOrgId = task.workspace.organizationId;
            const deworkOrgRef = db.collection("DeworkOrg").doc(deworkOrgId);
            if (orgsArr.some((o) => o.deworkOrgId === deworkOrgId)) {
              org = orgsArr.find((o) => o.deworkOrgId === deworkOrgId) || null;
            } else {
              const deworkOrg = await deworkOrgRef.get();
              if (deworkOrg.exists) {
                const d = deworkOrg.data() as DeworkOrg;
                org = d;
                orgsArr.push(d);
              } else {
                // create new organization on ceramic
                const orgName = task.workspace.organization.name;
                const orgIcon = task.workspace.organization.imageUrl;
                const orgDesc = task.workspace.organization.description;
                const orgId = await createOrganization(
                  orgName,
                  "0x0",
                  orgDesc,
                  orgIcon
                );
                org = {
                  deworkOrgId,
                  orgId,
                  name: orgName || null,
                  icon: orgIcon || null,
                  description: orgDesc || null,
                };
                orgsArr.push(org);
                await deworkOrgRef.set(org, { merge: true });
              }
            }
            if (org) {
              // convert work subject
              const subject = covnertTask2WorkSubject(address, task, org.orgId);
              batch.set(deworkTasksRef.doc(task.id), subject, { merge: true });
              subjects.push(subject);
            }
          }
          await batch.commit();
        }

        return { status: "ok", subjects: subjects };
      } catch (error) {
        return { status: "ng" };
      }
    } catch (err) {
      console.log(err);
      throw new functions.https.HttpsError(
        "unknown",
        "The function must be called while authenticated."
      );
    }
  });

export const reFetchDeworkUserTasks = functions
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB",
  })
  .https.onCall(async (data: any) => {
    try {
      const { address, id } = data;
      if (!address) {
        errorResponse("failed-precondition", "you must include txhash");
        return;
      }

      try {
        // get all previous tasks
        const deworkTasksRef = db
          .collection("deworkTasks")
          .doc(address)
          .collection("tasks");

        const claimedTasksDoc = await deworkTasksRef
          .where("streamId", "!=", null)
          .get();
        const claimedTasks = claimedTasksDoc.docs.map(
          (d) => d.data() as WorkSubjectFromDework
        );
        const claimedTaskIds = claimedTasks.map((t) => t.taskId || "");

        let newTasks: Task[] = [];
        const subjects: WorkSubjectFromDework[] = [];
        // from id param
        if (id) {
          newTasks = await getDeworkTasks(id);
          // WIP
        } else if (address) {
          const connectionDocRef = db
            .collection("connections")
            .where("address", "==", address);
          const res = await connectionDocRef.get();
          const { dework } = res.docs[0].data() as UserConnection;

          newTasks = await getDeworkTasks(dework.id);
        }

        if (newTasks && newTasks.length > 0) {
          const batch = db.batch();
          const orgsArr: DeworkOrg[] = [];

          for (const task of newTasks) {
            // exclude claimed task
            if (claimedTaskIds.includes(task.id)) continue;
            // get client info
            let org: DeworkOrg | null = null;
            const deworkOrgId = task.workspace.organizationId;
            const deworkOrgRef = db.collection("DeworkOrg").doc(deworkOrgId);
            if (orgsArr.some((o) => o.deworkOrgId === deworkOrgId)) {
              org = orgsArr.find((o) => o.deworkOrgId === deworkOrgId) || null;
            } else {
              const deworkOrg = await deworkOrgRef.get();
              if (deworkOrg.exists) {
                const d = deworkOrg.data() as DeworkOrg;
                org = d;
                orgsArr.push(d);
              } else {
                // create new organization on ceramic
                const orgName = task.workspace.organization.name;
                const orgIcon = task.workspace.organization.imageUrl;
                const orgDesc = task.workspace.organization.description;
                const orgId = await createOrganization(
                  orgName,
                  "0x0",
                  orgDesc,
                  orgIcon
                );
                org = {
                  deworkOrgId,
                  orgId,
                  name: orgName || null,
                  icon: orgIcon || null,
                  description: orgDesc || null,
                };
                orgsArr.push(org);
                await deworkOrgRef.set(org, { merge: true });
              }
            }
            if (org) {
              // convert work subject
              const subject = covnertTask2WorkSubject(address, task, org.orgId);
              batch.set(deworkTasksRef.doc(task.id), subject, { merge: true });
              subjects.push(subject);
            }
          }
          await batch.commit();
        }

        return { status: "ok", subjects: subjects };
      } catch (error) {
        return { status: "ng" };
      }
    } catch (err) {
      console.log(err);
      throw new functions.https.HttpsError(
        "unknown",
        "The function must be called while authenticated."
      );
    }
  });

export const updateGenreOfDeworkTask = functions.https.onCall(
  async (data: any) => {
    try {
      const { address, id, genre } = data;
      if (!address || !id || !genre) {
        errorResponse("failed-precondition", "you must include address");
        return { status: "ng", message: "you must include address" };
      }
      try {
        const deworkTaskRef = db
          .collection("deworkTasks")
          .doc(address)
          .collection("tasks")
          .doc(id);
        const deworkTaskDoc = await deworkTaskRef.get();
        if (!deworkTaskDoc.exists)
          return { status: "ng", message: "No Task Data" };
        const task = deworkTaskDoc.data() as WorkSubjectFromDework;
        if (!task.work) return { status: "ng", message: "No Task work Data" };
        const updated: WorkSubjectFromDework = {
          ...task,
          work: {
            ...task.work,
            genre: genre,
          },
        };
        await deworkTaskRef.update(updated);

        return { status: "ok", subject: updated };
      } catch (error) {
        return { status: "ng" };
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

export const issueCRDLFromDework = functions.https.onCall(async (data: any) => {
  try {
    const { address, ids, storeAll } = data;
    if (!address) {
      errorResponse("failed-precondition", "you must include address");
      return;
    }
    const targetDeworkIds = ids as string[];

    const deworkTasksRef = db
      .collection("deworkTasks")
      .doc(address)
      .collection("tasks");
    const deworkTasksDocs = await deworkTasksRef.get();
    const deworkTasksData: WorkSubjectFromDework[] =
      deworkTasksDocs.docs
        .map((t) => {
          const doc = t.data() as WorkSubjectFromDework;
          return { ...doc, taskId: t.id };
        })
        .filter((d) => !!d.work?.genre) || [];
    const targetTasks = storeAll
      ? deworkTasksData
      : deworkTasksData.filter((t) => targetDeworkIds.includes(t.taskId || ""));

    console.log({ targetTasks });

    // update and issue crdl into ceramic
    const updatedTasks = await issueWorkCRDLsFromDework(targetTasks);
    const batch = db.batch();
    const issued: string[] = [];

    console.log({ updatedTasks });

    for (const task of updatedTasks) {
      if (task.taskId && task.streamId) {
        batch.set(deworkTasksRef.doc(task.taskId), task, { merge: true });
        issued.push(task.streamId);
      }
    }
    await batch.commit();

    return { status: "ok", streamIds: issued };
  } catch (err) {
    console.log(err);
    throw new functions.https.HttpsError(
      "unknown",
      "The function must be called while authenticated."
    );
  }
});

// =======Main Function=======

// =======Utils=======
const errorResponse = (code: FunctionsErrorCode, error: string) => {
  throw new functions.https.HttpsError(code, error);
};
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

// send mail
export const sendAlert = async (text?: string) => {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return;
  sgMail.setApiKey(key);
  const msg = {
    to: "kantaro@vess.id",
    from: "info@vess.id",
    replyTo: "info@vess.id",
    subject: "Dework Access Token Error",
    text: text || "Dework Access Token maybe invalid",
  };

  try {
    await sgMail.send(msg);
  } catch (error) {
    console.log("error", JSON.stringify(error));
  }
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
//     from: "info@vess.id",
//     replyTo: "info@vess.id",
//     templateId: templateId,
//     dynamic_template_data: messageData,
//   };
//   try {
//     await sgMail.send(msg);
//   } catch (error) {
//     console.error(error);
//   }
// };

// const getMessageForSignature = (
//   txHash: string,
//   txAddress: string,
//   summary: string,
//   description?: string,
//   deliverable?: string
// ): string => {
//   return `Claim WorkCRDL for work detail below\n\nsummary: ${summary}\ndescription: ${
//     description ?? ""
//   }\ndeliverable: ${
//     deliverable ?? ""
//   }\ntxHash: ${txHash}\naddress: ${txAddress}`;
// };

// const getMessageForSignatureV2 = (
//   txHash: string,
//   txAddress: string,
//   summary: string,
//   description?: string,
//   deliverable?: string
// ): string => {
//   return `Claim Work Credential\n\nsummary: ${summary}\ndescription: ${
//     description ?? ""
//   }\ndeliverable: ${
//     deliverable ?? ""
//   }\ntxHash: ${txHash}\naddress: ${txAddress}`;
// };
const getDeworkAuthMessage = (nonce: string): string => {
  return `connect Dework ${nonce}`;
};
// =======Utils=======

// export const createWCDraftWighVerify = functions.https.onCall(
//   async (data: any) => {
//     if (!data.draft || !data.address) {
//       throw new functions.https.HttpsError(
//         "failed-precondition",
//         "you must include address and signature"
//       );
//     }

//     try {
//       const draft = data.draft as CVoxelMetaDraft;
//       const address = data.address as string;

//       const isPayee: boolean = address.toLowerCase() === draft.to.toLowerCase();

//       const signature = isPayee ? draft.toSig : draft.fromSig;
//       // const deliverable = draft.deliverables
//       //   ? draft.deliverables.map((d) => d.value).join(",")
//       //   : undefined;
//       // const message = getMessageForSignatureV2(
//       //   draft.txHash,
//       //   address.toLowerCase(),
//       //   draft.summary,
//       //   draft.detail,
//       //   deliverable
//       // );

//       // console.log("message", JSON.stringify(message));

//       // const dataBytes =
//       //   typeof message === "string" ? toUtf8Bytes(message) : message;

//       // Recover the address of the account used to create the given Ethereum signature.
//       // const recoveredAddress = recoverPersonalSignature({
//       //   data: hexlify(dataBytes),
//       //   signature: signature,
//       // });

//       // console.log("recoveredAddress", recoveredAddress);
//       console.log("address", address.toLowerCase());
//       console.log("signature", signature);

//       // add fiat value
//       const fiat = await getFiatValue(
//         draft.value,
//         draft.tokenSymbol,
//         draft.tokenDecimal ? draft.tokenDecimal.toString() : "18",
//         draft.issuedTimestamp
//       );
//       const cvoxelMeta: CVoxel = {
//         ...draft,
//         fiatValue: fiat,
//         fiatSymbol: "USD",
//       };

//       const cVoxelDocRef = db
//         .collection("cvoxels")
//         .doc(`${draft.networkId}_${draft.txHash}`);
//       await cVoxelDocRef.set(cvoxelMeta, { merge: true });
//       return { status: "ok", fiat: fiat };
//     } catch (err) {
//       console.log("error", err);
//       throw new functions.https.HttpsError(
//         "unknown",
//         "The function must be called while authenticated."
//       );
//     }
//   }
// );
