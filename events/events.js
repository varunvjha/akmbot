const { WAConnection, ReconnectMode } = require("@adiwajshing/baileys");
const client = new WAConnection();
const path = require("path");
const fs = require("fs");
const settingread = require(path.join(__dirname, "../snippets/settingcheck"));
const { switchcase } = require(path.join(__dirname, "../snippets/case"));
var qri = require("qr-image");
const sql = require(path.join(__dirname, "../snippets/ps"));
const node_cron = require("node-cron");

async function connect() {
  try {
    auth_result = await sql.query("select * from auth;");
    console.log("Fetching login data...");
    auth_row_count = await auth_result.rowCount;
    if (auth_row_count == 0) {
      console.log("No login data found!");
    } else {
      console.log("Login data found!");
      auth_obj = {
        clientID: auth_result.rows[0].clientid,
        serverToken: auth_result.rows[0].servertoken,
        clientToken: auth_result.rows[0].clienttoken,
        encKey: auth_result.rows[0].enckey,
        macKey: auth_result.rows[0].mackey,
      };
      client.loadAuthInfo(auth_obj);
    }

    client.on("qr", (qr) => {
      qri
        .image(qr, { type: "png" })
        .pipe(fs.createWriteStream("./public/qr.png"));
      console.log("scan the qr above ");
    });
    client.on("connecting", () => {
      console.clear();
      console.log("connecting...");
    });
    await client.connect({ timeoutMs: 30 * 1000 });
    client.on("open", () => {
      console.clear();
      console.log("connected");

      console.log(`credentials updated!`);
      fs.unlink("./public/qr.png", () => {});
    });
    const authInfo = client.base64EncodedAuthInfo();
    load_clientID = authInfo.clientID;
    load_serverToken = authInfo.serverToken;
    load_clientToken = authInfo.clientToken;
    load_encKey = authInfo.encKey;
    load_macKey = authInfo.macKey;

    if (auth_row_count == 0) {
      console.log("Inserting login data...");
      sql.query("INSERT INTO auth VALUES($1,$2,$3,$4,$5);", [
        load_clientID,
        load_serverToken,
        load_clientToken,
        load_encKey,
        load_macKey,
      ]);
      console.log("New login data inserted!");
    } else {
      console.log("Updating login data....");
      sql.query(
        "UPDATE auth SET clientid = $1, servertoken = $2, clienttoken = $3, enckey = $4, mackey = $5;",
        [
          load_clientID,
          load_serverToken,
          load_clientToken,
          load_encKey,
          load_macKey,
        ]
      );
      sql.query("commit;");
      console.log("Login data updated!");
    }
  } catch {
    console.log("Creating database...");
    await sql.query(
      "CREATE TABLE IF NOT EXISTS auth(clientID text, serverToken text, clientToken text, encKey text, macKey text);"
    );
    await connect();
  }
}

async function main() {
  try {
    console.clear();
    client.logger.level = "fatal";
    await connect();
    console.clear();
    client.autoReconnect = ReconnectMode.onConnectionLost;
    client.connectOptions.maxRetries = 100;

    console.log("Hello " + client.user.name);
    node_cron.schedule(process.env.CRON, async () => {
   
      console.log("Clearing All Chats");
      for (let { jid } of client.chats.all()) {
        await client.modifyChat(jid, "delete");
        await client.modifyChat(jid, "clear", {});
        console.log("Cleared all Chats!");
      }
    });

    client.on("chat-update", async (xxx) => {
      try {
        if (!xxx.hasNewMessage) return;
        xxx = xxx.messages.all()[0];
        if (!xxx.message) return;
        if (xxx.key && xxx.key.remoteJid == "status@broadcast") return;
        if (xxx.key.fromMe) return;
        const from = xxx.key.remoteJid;
        const type = Object.keys(xxx.message)[0];
        body =
          type === "conversation"
            ? xxx.message.conversation
            : type === "imageMessage"
            ? xxx.message.imageMessage.caption
            : type === "videoMessage"
            ? xxx.message.videoMessage.caption
            : type == "extendedTextMessage"
            ? xxx.message.extendedTextMessage.text
            : "";
        const isGroup = from.endsWith("@g.us");
        const sender = isGroup ? xxx.participant : xxx.key.remoteJid;
        const groupMetadata = isGroup ? await client.groupMetadata(from) : "";
        const groupName = isGroup ? groupMetadata.subject : "";
        const infor = await settingread(
          body,
          from,
          sender,
          groupName,
          client,
          groupMetadata
        );

        if (
          infor.noofmsgtoday > 30 ||
          infor.isnumberblockedingroup ||
          infor.arg == null ||
          infor.arg.length == 0
        )
          return;
        console.log(infor);

        switchcase(infor, client, xxx);
      } catch (error) {
        console.log(error);
      }
    });
  } catch (err) {
    console.log("ErRoR-------------" + err);
  }
}

async function stop() {
  client.close();
  console.clear();
  console.log("Stopped");
}
async function isconnected() {
  return client.state;
}
async function logout() {
  client.clearAuthInfo();
  sql.query("truncate TABLE auth;");
  client.close();
  console.clear();
  console.log("Logged out");
}

//main();
module.exports.main = main;
module.exports.logout = logout;
module.exports.stop = stop;
module.exports.isconnected = isconnected;
