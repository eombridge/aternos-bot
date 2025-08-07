const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalBlock } = goals;

const config = require('./settings.json');
const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('Bot has arrived');
});

app.listen(8000, () => {
  console.log('Server started');
});

function createBot() {
  const bot = mineflayer.createBot({
    username: config['bot-account']['username'],
    password: config['bot-account']['password'],
    auth: config['bot-account']['type'],
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  let pendingPromise = Promise.resolve();

  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      console.log(`[Auth] Sent /register command.`);

      bot.once('chat', (username, message) => {
        console.log(`[ChatLog] <${username}> ${message}`);
        if (message.includes('successfully registered')) {
          console.log('[INFO] Registration confirmed.');
          resolve();
        } else if (message.includes('already registered')) {
          console.log('[INFO] Bot was already registered.');
          resolve();
        } else {
          reject(`Registration failed: unexpected message "${message}".`);
        }
      });
    });
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      console.log(`[Auth] Sent /login command.`);

      bot.once('chat', (username, message) => {
        console.log(`[ChatLog] <${username}> ${message}`);
        if (message.includes('successfully logged in')) {
          console.log('[INFO] Login successful.');
          resolve();
        } else {
          reject(`Login failed: unexpected message "${message}".`);
        }
      });
    });
  }

  // 메시지를 좀 더 자연스럽게 변형하는 함수
  function humanizeMessage(msg) {
    // 20% 확률로 이모지 추가
    if (Math.random() < 0.2) {
      const emojis = ['😊', '😄', '👍', '😉', '😂', '🙌', '✨'];
      msg += ' ' + emojis[Math.floor(Math.random() * emojis.length)];
    }
    // 10% 확률로 마지막에 느낌표 추가
    if (Math.random() < 0.1 && !msg.endsWith('!')) {
      msg += '!';
    }
    // 5% 확률로 문장 중간에 ... 넣기
    if (Math.random() < 0.05) {
      const pos = Math.floor(msg.length / 2);
      msg = msg.slice(0, pos) + '...' + msg.slice(pos);
    }
    return msg;
  }

  function sendChatMessagesRandomly(messages) {
    let i = 0;

    function sendNextMessage() {
      if (!bot || !bot.chat) return;

      const originalMsg = messages[i];
      const msg = humanizeMessage(originalMsg);
      bot.chat(msg);

      i = (i + 1) % messages.length;

      // 3~8초 사이 랜덤 간격 (더 짧게)
      const delay = 3000 + Math.random() * 5000;
      setTimeout(sendNextMessage, delay);
    }

    sendNextMessage();
  }

  bot.once('spawn', () => {
    console.log('\x1b[33m[AfkBot] Bot joined the server', '\x1b[0m');

    // Auto-auth
    if (config.utils['auto-auth'].enabled) {
      console.log('[INFO] Started auto-auth module');
      const password = config.utils['auto-auth'].password;

      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(error => console.error('[ERROR]', error));
    }

    // Chat message module
    if (config.utils['chat-messages'].enabled) {
      console.log('[INFO] Started chat-messages module');
      const messages = config.utils['chat-messages']['messages'];

      if (config.utils['chat-messages'].repeat) {
        // 반복하는 경우엔 새로 만든 자연스러운 랜덤 메시지 함수 사용
        sendChatMessagesRandomly(messages);
      } else {
        messages.forEach((msg) => {
          bot.chat(msg);
        });
      }
    }

    // Movement to position
    if (config.position.enabled) {
      const pos = config.position;
      console.log(`\x1b[32m[Afk Bot] Moving to target (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }

    // Enhanced Anti-AFK module
    if (config.utils['anti-afk'].enabled) {
      console.log('[INFO] Started enhanced anti-AFK module');

      const actions = ['jump', 'forward', 'back', 'left', 'right', 'sneak', 'look', 'chat'];
      const chatMessages = ['여기 있어요!', '움직이고 있어요!', '👀', '나 살아있어요!', 'AFK 방지 중'];

      function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      function doRandomAction() {
        const action = actions[Math.floor(Math.random() * actions.length)];

        switch (action) {
          case 'jump':
          case 'forward':
          case 'back':
          case 'left':
          case 'right':
          case 'sneak':
            bot.setControlState(action, true);
            setTimeout(() => bot.setControlState(action, false), getRandomInt(300, 1000));
            break;

          case 'look':
            const yaw = Math.random() * Math.PI * 2;
            const pitch = (Math.random() - 0.5) * Math.PI;
            bot.look(yaw, pitch, true);
            break;

          case 'chat':
            // 여기서도 메시지를 랜덤하게 바꿔서 좀 더 사람같게
            let msg = chatMessages[Math.floor(Math.random() * chatMessages.length)];
            msg = humanizeMessage(msg);
            bot.chat(msg);
            break;
        }

        // 다음 행동까지 랜덤 딜레이 4~8초 유지
        const nextDelay = getRandomInt(4000, 8000);
        setTimeout(doRandomAction, nextDelay);
      }

      doRandomAction();
    }
  });

  bot.on('goal_reached', () => {
    console.log(`\x1b[32m[AfkBot] Bot arrived at the target location. ${bot.entity.position}\x1b[0m`);
  });

  bot.on('death', () => {
    console.log(`\x1b[33m[AfkBot] Bot has died and respawned at ${bot.entity.position}\x1b[0m`);
  });

  // Auto reconnect
  if (config.utils['auto-reconnect']) {
    bot.on('end', () => {
      setTimeout(() => {
        console.log('[INFO] Reconnecting bot...');
        createBot();
      }, config.utils['auto-recconect-delay']);
    });
  }

  bot.on('kicked', (reason) => {
    console.log('\x1b[33m', `[AfkBot] Kicked from server: \n${reason}`, '\x1b[0m');
  });

  bot.on('error', (err) => {
    console.log(`\x1b[31m[ERROR] ${err.message}`, '\x1b[0m');
  });
}

createBot();
