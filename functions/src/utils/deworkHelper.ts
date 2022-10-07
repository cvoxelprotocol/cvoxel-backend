import { BigNumber } from "ethers";
import fetch from "node-fetch";
import { sendAlert } from "../index.js";
import { Skill, Task } from "../types.js";
import { DeworkUser, ThreePid } from "../types/user.js";
import { WorkSubjectFromDework } from "../types/workCredential.js";
import {
  Client,
  DeliverableItem,
  Deliverables,
  Transaction,
  Work,
} from "../__generated__/types/workCredential.js";
import { getPkhDIDFromAddress } from "./ceramicHelper.js";
import { convertDateToTimestampStr } from "./commonUtil.js";

const DEWORK_URL = "https://api.deworkxyz.com/graphql";
const USER_ID_FROM_NAME_QUERY = `
query UserProfileByUsernameQuery($username: String!) {
    user: getUserByUsername(username: $username) {
      ...User
    }
  }
  
  fragment User on User {
    id
    
  }
`;

const USER_ADDRESS_QUERY = `
query UserAddressQuery($id: UUID!) {
    user: getUser(id: $id) {
      id
      threepids {
        source
        address: threepid
      }
      
    }
  }
`;

const USER_TASKS_QUERY = `
query UserTasksQuery($id: UUID!) {
  user: getUser(id: $id) {
    id
    tasks {
      ...TaskWithOrganization
    }
    
  }
}

fragment TaskWithOrganization on Task {
  ...Task
  workspace {
    ...Workspace
    organization {
      ...Organization
    }
    
  }
  
}

fragment Task on Task {
  id
  name
  description
  status
  dueDate
  createdAt
  doneAt
  deletedAt
  workspaceId
  workspace {
    ...Workspace
    
  }
  parentTaskId
  parentTask {
    id
    name
    
  }
  sectionId
  number
  gating
  openToBids
  submissionCount
  applicationCount
  tags {
    ...TaskTag
    
  }
  skills {
    ...Skill
    
  }
  assignees {
    ...User
    
  }
  owners {
    ...User
    
  }
  creator {
    ...User
    
  }
  rewards {
    ...TaskReward
    
  }
  review {
    ...TaskReview
    
  }
  reactions {
    ...TaskReaction
    
  }
  
}

fragment TaskTag on TaskTag {
  id
  label
  
}

fragment Skill on Skill {
  id
  name
  emoji
  
}

fragment TaskReward on TaskReward {
  id
  amount
  peggedToUsd
  fundingSessionId
  token {
    ...PaymentToken
    network {
      ...PaymentNetwork
      
    }
    
  }
  tokenId
  payments {
    id
    amount
    user {
      ...User
      
    }
    payment {
      ...Payment
      
    }
    
  }
  
}

fragment Payment on Payment {
  id
  status
  data
  paymentMethod {
    ...PaymentMethod
    
  }
  
}

fragment PaymentMethod on PaymentMethod {
  id
  type
  address
  network {
    ...PaymentNetwork
    
  }
  
}

fragment PaymentNetwork on PaymentNetwork {
  id
  slug
  name
  type
  config
  
}

fragment PaymentToken on PaymentToken {
  id
  exp
  type
  name
  symbol
  address
  identifier
  usdPrice
  networkId
  
}

fragment User on User {
  id
  username
  
}

fragment TaskReview on TaskReview {
  id
  message
  rating
  
}

fragment TaskReaction on TaskReaction {
  id
  userId
  reaction
  
}

fragment Workspace on Workspace {
  id
  slug
  name
  status
  deletedAt
  organizationId
  permalink
  
}

fragment Organization on Organization {
  id
  name
  slug
  tagline
  permalink
  imageUrl
  description
}

`;

const TOKEN =
  process.env.DEWORK_TOKEN ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0ZjExYTgyYS1kMzUzLTQxZGYtOTk5ZC03ZmFlMDhkOWY1NjgiLCJpYXQiOjE2NjEzOTc1MDZ9.1vOjioYJcANV1NThZ5X06QjdG-6F8BKs5s_eGidVmD4";

export const getDeworkUserInfo = async (
  name: string
): Promise<DeworkUser | null> => {
  try {
    const idData = await graphFetch(DEWORK_URL, USER_ID_FROM_NAME_QUERY, {
      username: name,
    });
    const userId = idData["data"]["user"]["id"] as string;
    console.log({ userId });
    if (!userId) return null;

    const addressData = await graphFetch(DEWORK_URL, USER_ADDRESS_QUERY, {
      id: userId,
    });

    const threepids = addressData["data"]["user"]["threepids"] as ThreePid[];
    console.log({ threepids });
    const address = threepids.find((t) => t.source === "metamask")?.address;
    if (!address) return null;

    return {
      id: userId,
      name: name,
      address: address,
    } as DeworkUser;
  } catch (error) {
    console.log(error);
    return null;
  }
};

export const getDeworkTasks = async (id: string): Promise<Task[]> => {
  try {
    const res = await graphFetch(DEWORK_URL, USER_TASKS_QUERY, {
      id: id,
    });
    console.log({ res });
    const tasks = res["data"]["user"]["tasks"] as Task[];
    return tasks.filter((task) => task["status"] === "DONE");
  } catch (error) {
    console.log(error);
    return [];
  }
};

const graphFetch = async (
  url: string,
  query: string,
  variables: { [x: string]: any }
): Promise<any> => {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        query: query,
        variables: variables,
      }),
    });
    return res.json();
  } catch (error) {
    console.log(error);
    await sendAlert();
    await sendAlert(JSON.stringify(error));
  }
};

export const covnertTask2WorkSubject = (
  address: string,
  task: Task,
  orgId: string
): WorkSubjectFromDework => {
  // Deliverable
  const deliverables: Deliverables = [];
  if (task.assignees && task.assignees.length > 0) {
    const profilePageUrl =
      task.assignees[0].permalink ||
      `https://app.dework.xyz/profile/${task.assignees[0].username}`;
    const deliverable: DeliverableItem = {
      format: "url",
      value: `${profilePageUrl}?taskId=${task.id}`,
    };
    deliverables.push(deliverable);
  }

  // Client
  const client: Client = {
    format: "orgId",
    value: orgId,
  };

  // Transaction
  const tx: Transaction = {
    txHash: "0x0",
    from: "0x0",
    to: address,
    isPayer: false,
    relatedTxHashes: [address],
    fiatSymbol: "USD",
  };
  let usdPrice = 0;
  if (task.rewards.length > 0) {
    const reward = task.rewards[0];
    if (reward.token) {
      tx.tokenSymbol = reward.token.symbol;
      tx.tokenDecimal = reward.token.exp;
      tx.networkId = reward.token.network.config.chainId;
      usdPrice = reward.token.usdPrice;
    }
    if (reward.peggedToUsd) {
      tx.fiatValue = reward.amount;
    } else {
      tx.value = reward.amount;
    }
    if (reward.payments.length > 0) {
      const payment = reward.payments[0];
      tx.value = payment.amount;
      if (payment.payment.data.txHash) {
        tx.txHash = payment.payment.data.txHash;
      }
    }
    if (!tx.fiatValue && !!usdPrice && !!tx.value) {
      tx.fiatValue = BigNumber.from(tx.value).mul(usdPrice).toString();
    }
  }

  // work
  const tags = task.tags ? task.tags.map((t) => t.label) : [];

  const work: Work = {
    id: getPkhDIDFromAddress(address),
    value: tx.fiatValue || tx.value || "0",
    tax: "0",
    summary: task.name,
    detail: task.description || "",
    tags: tags,
    jobType: "OneTime",
    platform: "Dework",
    organization: orgId,
    issuedAt: convertDateToTimestampStr(new Date()),
  };

  if (task.skills && task.skills.length > 0) {
    work.genre = genreConverter(task.skills[0]);
  }

  if (task.doneAt) {
    work.endTimestamp = Date.parse(task.doneAt).toString();
  }

  const subject: WorkSubjectFromDework = {
    work: work,
    tx: tx,
    deliverables: deliverables,
    client: client,
    taskId: task.id,
    streamId: null,
  };
  return subject;
};

const genreConverter = (skill: Skill): string => {
  if (skill.name == "Development") {
    return "Dev";
  } else if (skill.name == "Design") {
    return "Design";
  } else if (
    skill.name == "Translation" ||
    skill.name == "Writing" ||
    skill.name == "Marketing"
  ) {
    return "Marketing";
  } else if (skill.name == "Community") {
    return "Community";
  } else {
    return "Other";
  }
};
