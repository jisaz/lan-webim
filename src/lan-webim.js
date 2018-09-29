let webim = null;
let userInfo = {};
let selType = null;
let selSess = null;
let isLogin = false;

/**
 * function convertTextMsg
 * 解析文本消息元素
 * */
function convertTextMsg(content) {
  return content.getText();
}

/**
 * function convertFaceMsg
 * 解析表情消息元素，如果有表情转换为img标签
 * */
function convertFaceMsg(content) {
  let faceUrl = null;
  const data = content.getData();
  const index = webim.EmotionDataIndexs[data];

  const emotion = webim.Emotions[index];
  if (emotion && emotion[1]) {
    faceUrl = emotion[1];
  }
  if (faceUrl) {
    return {
      img: `<img src="${faceUrl}" />`,
      data
    };
  }
  return { data };
}

/**
 * function convertImageMsg
 * 解析图片消息元素
 * */
function convertImageMsg(content) {
  const smallImage = content.getImage(webim.IMAGE_TYPE.SMALL); //  小图
  let bigImage = content.getImage(webim.IMAGE_TYPE.LARGE); //  大图
  let oriImage = content.getImage(webim.IMAGE_TYPE.ORIGIN); //  原图
  if (!bigImage) {
    bigImage = smallImage;
  }
  if (!oriImage) {
    oriImage = smallImage;
  }
  return [smallImage.getUrl(), bigImage.getUrl(), oriImage.getUrl()];
}

/**
 * function convertFileMsg
 * 解析文件消息元素
 * */
function convertFileMsg(content) {
  let fileSize = null;
  fileSize = content.getSize();
  if (fileSize >= 1024) {
    fileSize = Math.round(fileSize / 1024);
  }
  return {
    url: content.getDownUrl(),
    fileSize
  };
}

/**
 * function convertMsg
 * 解析各类消息
 * */
function convertMsg(msg) {
  let html = '';
  let elem = '';
  let type = '';
  let content = '';
  const elems = msg.getElems(); // 获取消息包含的元素数组
  const count = elems.length;
  let msgType = 'text';
  let faceData = '';

  for (let i = 0; i < count; i++) {
    elem = elems[i];
    type = elem.getType(); // 获取元素类型
    content = elem.getContent(); // 获取元素对象
    switch (type) {
      case webim.MSG_ELEMENT_TYPE.TEXT: {
        const eleHtml = convertTextMsg(content);
        const htmlStr = webim.Tool.formatText2Html(eleHtml);
        // 转义，防XSS
        html += htmlStr;
        faceData += htmlStr;
        break;
      }
      case webim.MSG_ELEMENT_TYPE.FACE: {
        const dataJson = convertFaceMsg(content)
        html += (dataJson.img || dataJson.data);
        faceData += dataJson.data;
        msgType = 'text_face';
        break;
      }
      case webim.MSG_ELEMENT_TYPE.IMAGE: {
        msgType = 'image';
        if (i <= count - 2) {
          const customMsgElem = elems[i + 1]; // 获取保存图片名称的自定义消息elem
          const imgName = customMsgElem.getContent().getData(); // 业务可以自定义保存字段，demo中采用data字段保存图片文件名
          html += convertImageMsg(content, imgName);
          i++;// 下标向后移一位
        } else {
          html += convertImageMsg(content);
        }
        break;
      }
      // case webim.MSG_ELEMENT_TYPE.FILE: {
      //     html += convertFileMsg(content);
      //     break;
      // }
      default: {
        webim.Log.error('未知消息元素类型: elemType=' + type);
        break;
      }
    }
  }
  return { content: html, type: msgType, faceData };
}


/**
 * function validateErr
 * 错误验证
 *
 * @return {string|null};
 * */
function validateErr(type) {
  let err = null;

  switch (type) {
    case 'sdkLogin': {
      if (!webim) {
        err = '未初始化应用';
      }
      break;
    }
    case 'sdkLogout':
    case 'analysisMsg':
    case 'onSendMsg':
    case 'uploadPic':
    case 'getRecentContactList':
    case 'getUnreadCountList':
    case 'setAutoRead': {
      if (!webim) {
        err = '未初始化应用';
      } else if (!isLogin) {
        err = '未登录';
      }
      break;
    }
    case 'getLastC2CHistoryMsgs': {
      if (!webim) {
        err = '未初始化应用';
      } else if (!isLogin) {
        err = '未登录';
      } else if (selType === webim.SESSION_TYPE.GROUP) {
        err = '当前的聊天类型为群聊天，不能进行拉取好友历史消息操作';
      }
      break;
    }
    case 'getEmotions': {
      if (!webim) {
        err = '未初始化应用';
      }
      break;
    }
    default: {
      break;
    }
  }
  if (err) {
    console.error(err);
  }
  return err;
}

/**
 * function onSendPic
 * 发送图片消息
 *
 * @param {Object} images 上传图片对象
 *
 * @return {Promise} resole返回图片信息Object
 *
 * */
function onSendPic(images, To_Account, headerUrl) {
  //  重新new一个sess，不然会一直发送给一个人

  const picSelSess = new webim.Session(selType, To_Account, To_Account, headerUrl,
    Math.round(new Date().getTime() / 1000));

  const isSend = true; //  是否为自己发送
  const seq = -1; //  消息序列，-1表示sdk自动生成，用于去重
  const random = Math.round(Math.random() * 4294967296); //  消息随机数，用于去重
  const msgTime = Math.round(new Date().getTime() / 1000); //  消息时间戳
  let subType; //  消息子类型
  if (selType === webim.SESSION_TYPE.C2C) {
    subType = webim.C2C_MSG_SUB_TYPE.COMMON;
  } else {
    //  webim.GROUP_MSG_SUB_TYPE.COMMON-普通消息,
    //  webim.GROUP_MSG_SUB_TYPE.LOVEMSG-点赞消息，优先级最低
    //  webim.GROUP_MSG_SUB_TYPE.TIP-提示消息(不支持发送，用于区分群消息子类型)，
    //  webim.GROUP_MSG_SUB_TYPE.REDPACKET-红包消息，优先级最高
    subType = webim.GROUP_MSG_SUB_TYPE.COMMON;
  }
  const msg = new webim.Msg(picSelSess, isSend, seq, random, msgTime, userInfo.identifier, subType, userInfo.identifierNick);

  const imagesObj = new webim.Msg.Elem.Images(images.File_UUID);
  for (const i in images.URL_INFO) {
    const img = images.URL_INFO[i];
    let newImg = null;
    let type;
    switch (img.PIC_TYPE) {
      case 1: {
        type = 1;// 原图
        break;
      }
      case 2: {
        type = 3; // 小图（缩略图）
        break;
      }
      case 4: {
        type = 2;// 大图
        break;
      }
      default: {
        break;
      }
    }
    newImg = new webim.Msg.Elem.Images.Image(type, img.PIC_Size, img.PIC_Width, img.PIC_Height, img.DownUrl);
    imagesObj.addImage(newImg);
  }
  msg.addImage(imagesObj);

  return new Promise((resolve, reject) => {
    //  调用发送图片接口
    webim.sendMsg(msg, () => {
      const imgsMsg = analysisMsg(msg);
      resolve(imgsMsg);
    }, (err) => {
      reject(err);
    });
  });
}

/**
 * function initWebim
 *
 * @param {object} im webim对象  必填
 *
 * @return [无]
 * */
export function initWebim(im) {
  webim = im;
  selType = webim.SESSION_TYPE.C2C;
}

/**
 * function sdkLogin
 * 登录im
 *
 * @param {object} loginInfo  用户信息对象  必填
 *   {
 *       sdkAppID  - string 用户标识接入SDK的应用ID，必填
 *       appIDAt3rd - string 用户所属应用ID（同sdkAppID），必填
 *       accountType  - int, 账号类型，必填
 *       identifier   - String, 用户帐号,必须是字符串类型，必填
 *       identifierNick  - String, 用户昵称，选填
 *       userSig  - String 鉴权Token，必须是字符串类型，必填
 *       headurl - String 当前用户头像，选填
 *   }
 * @param {object} listeners  事件回调对象，为必填参数
 *  {
 *      onConnNotify - function 监听连接状态回调变化事件  必填
 *      onKickedEventCall - function 被其他登录实例踢下线  选填
 *      onMsgNotify  - function(newMsgList), 用于收到消息通知的回调函数
 *         newMsgList为新消息数组，格式为[Msg对象]在本地使用可以将得到的消息通过 analysisMsg 处理
 *   }
 *
 * @param {object} 【options】 其他对象 选填
 * {
 *    isAccessFormalEnv Boolean 是否访问正式环境下的后台接口，True-访问正式，False-访问测试环境默认访问正式环境接口
 *    isLogOn Boolean 是否开启控制台打印日志，True-开启，False-关闭，默认开启
 * }
 *
 * @return {Promise} 返回登录成功或者失败状态
 *
 * */
export function sdkLogin(loginInfo, listeners, options = {isAccessFormalEnv: true, isLogOn: false}) {
  return new Promise((resolve, reject) => {
    const err = validateErr('sdkLogin');
    if (err) {
      reject(err);
      return;
    }
    webim.login(loginInfo, listeners, options, () => {
      userInfo = Object.assign({}, loginInfo);
      isLogin = true;
      resolve('login ok');
    }, () => {
      reject('login error');
    });
  });
}

/**
 * funtion logout
 * 退出im
 *
 * @return {Promise}
 * */
export function sdkLogout() {
  return new Promise((resolve, reject) => {
    const err = validateErr('sdkLogout');
    if (err) {
      reject(err);
      return;
    }
    webim.logout(
      () => {
        isLogin = false;
        selSess = null;
        resolve('logout ok');
      },
      () => {
        reject('logout error');
      }
    );
  });
}

/**
 * function analysisMsg
 * 转换消息为指定格式
 * @param {Object} msg - 转换的msg对象 必填
 *
 * @return {object} 返回的消息对象
 *    isSelfSend {boolean} 是否自己发送
 *    fromAccount {string} 发送的账户
 *    fromAccountNick {string} 发送账户昵称
 *    time {number} 发送消息的时间戳
 *    content {string} 发送的内容 如果 type 为image则返回以逗号分隔的大图、中图、小图字符串
 *    type {string} 发送消息的类型
 * */
export function analysisMsg(msg) {
  selSess = msg.getSession();
  const isSelfSend = msg.getIsSend();
  const fromAccount = msg.getFromAccount();
  const fromAccountNick = msg.getFromAccountNick();
  const time = msg.getTime();
  const contentJson = convertMsg(msg);
  const content = contentJson.content;
  const type = contentJson.type;
  const err = validateErr('analysisMsg');

  if (!fromAccount || err) {
    return {};
  }

  return {
    isSelfSend,
    fromAccount,
    fromAccountNick,
    time,
    content,
    dataToPush: contentJson.faceData,
    type
  };
}

/**
 * 获取好友历史消息（只针对好友聊天，不支持群聊天）
 *
 * @param {object} options 必填
 * {
 *      Peer_Account  - 好友账号
 *      MaxCnt - 拉取条数
 *      LastMsgTime - 最近消息时间,第一次可以传0
 *      MsgKey - 最近消息的key 第一次传''
 * }
 *
 * @return {Promise} resole返回Object包含LastMsgTime，MsgKey，complete
 *
 * */
export function getLastC2CHistoryMsgs(options) {
  return new Promise((resolve, reject) => {
    const err = validateErr('getLastC2CHistoryMsgs');
    if (err) {
      reject(err);
      return;
    }
    webim.getC2CHistoryMsgs(
      options,
      (resp) => {
        const params = {
          Complete: resp.Complete, //  是否还有历史消息可以拉取，1-表示没有，0-表示有
          LastMsgTime: resp.LastMsgTime,
          MsgKey: resp.MsgKey
        };
        const msgList = resp.MsgList.map((msg) => {
          if (msg.getSession().id() === options.Peer_Account) {
            // 自动已读上报
            webim.setAutoRead(msg.getSession(), true, true);
          }
          return analysisMsg(msg);
        });
        params.msgList = msgList;
        resolve(params);
      },
      () => {
        reject('error');
      }
    );
  });
}

/**
 * function onSendMsg
 * 发送消息
 *
 * @param {String} msgtosend 要发送的消息 必填
 * @param {String} Peer_Account 好友的账户id 必填
 * @param {String} headerUrl 好友的头像地址 必填
 *
 * @return {Promise} resole返回消息Object
 * */
export function onSendMsg(msgtosend, Peer_Account, headerUrl) {
  let errMsg = null;
  let maxLen = null;
  const err = validateErr('onSendMsg');

  if (err) {
    errMsg = err;
  } else if (!Peer_Account) {
    errMsg = '未选择好友';
    console.error(errMsg);
  } else if (!msgtosend) {
    errMsg = '消息不能为空';
    console.error(errMsg);
  }
  //  获取消息内容
  const msgLen = webim.Tool.getStrBytes(msgtosend);

  if (selType === webim.SESSION_TYPE.C2C) {
    maxLen = webim.MSG_MAX_LENGTH.C2C;
  } else {
    maxLen = webim.MSG_MAX_LENGTH.GROUP;
  }
  if ((msgLen > maxLen) && !errMsg) {
    errMsg = '消息超出允许长度';
    console.error(errMsg);
  }

  if (errMsg) {
    return new Promise((resolve, reject) => {
      reject(errMsg);
    });
  }

  //  重新new一个sess，不然会一直发送给一个人
  const msgSelSess = new webim.Session(
    selType,
    Peer_Account,
    Peer_Account,
    headerUrl,
    Math.round(new Date().getTime() / 1000)
  );

  const isSend = true; //  是否为自己发送
  const seq = -1; //  消息序列，-1表示sdk自动生成，用于去重
  const random = Math.round(Math.random() * 4294967296); //  消息随机数，用于去重
  const msgTime = Math.round(new Date().getTime() / 1000); //  消息时间戳
  let subType; //  消息子类型
  if (selType === webim.SESSION_TYPE.C2C) {
    subType = webim.C2C_MSG_SUB_TYPE.COMMON;
  } else {
    subType = webim.GROUP_MSG_SUB_TYPE.COMMON;
  }

  // new sess，以免发送给同一人
  const msg = new webim.Msg(msgSelSess, isSend, seq, random, msgTime, userInfo.identifier, subType, userInfo.identifierNick);

  let textObj = null;
  let faceObj = null;
  let tmsg = null;
  let emotionIndex = null;
  let emotion = null;
  let restMsgIndex = null;
  //  解析文本和表情
  const expr = /\[[^[\]]{1,3}\]/mg;
  const emotions = msgtosend.match(expr);
  if (!emotions || emotions.length < 1) {
    textObj = new webim.Msg.Elem.Text(msgtosend);
    msg.addText(textObj);
  } else {
    for (let i = 0; i < emotions.length; i++) {
      tmsg = msgtosend.substring(0, msgtosend.indexOf(emotions[i]));
      if (tmsg) {
        textObj = new webim.Msg.Elem.Text(tmsg);
        msg.addText(textObj);
      }
      emotionIndex = webim.EmotionDataIndexs[emotions[i]];
      emotion = webim.Emotions[emotionIndex];

      if (emotion) {
        faceObj = new webim.Msg.Elem.Face(emotionIndex, emotions[i]);
        msg.addFace(faceObj);
      } else {
        textObj = new webim.Msg.Elem.Text(emotions[i]);
        msg.addText(textObj);
      }
      restMsgIndex = msgtosend.indexOf(emotions[i]) + emotions[i].length;
      msgtosend = msgtosend.substring(restMsgIndex);
    }
    if (msgtosend) {
      textObj = new webim.Msg.Elem.Text(msgtosend);
      msg.addText(textObj);
    }
  }

  msg.sending = 1;
  msg.originContent = msgtosend;

  return new Promise((resolve, reject) => {
    webim.sendMsg(msg, () => {
      //  私聊时，在聊天窗口手动添加一条发的消息，群聊时，长轮询接口会返回自己发的消息
      if (selType === webim.SESSION_TYPE.C2C) {
        const msgToShow = analysisMsg(msg);
        selSess = msgSelSess;
        resolve(msgToShow);
      }
      webim.Tool.setCookie('tmpmsg_' + Peer_Account, '', 0);
    }, (err) => {
      reject(err);
    });
  });
}

/**
 * function uploadPic
 *
 *  @param {Elem} uploadFiles 上传图片的file节点 必填
 *  @param {string} To_Account 好友账号
 *  @param {string} headerUrl 好友头像
 *  @param {Function} onProgressCb 上传图片进度回调函数 选填
 * */
export function uploadPic(file, To_Account, headerUrl, onProgressCb = () => {
}) {
  const err = validateErr('uploadPic');
  let businessType; //  业务类型，1-发群图片，2-向好友发图片

  if (err) {
    return new Promise((resolve, reject) => {
      reject(err);
    });
  }

  if (selType === webim.SESSION_TYPE.C2C) { //  向好友发图片
    businessType = webim.UPLOAD_PIC_BUSSINESS_TYPE.C2C_MSG;
  } else if (selType === webim.SESSION_TYPE.C2C.GROUP) { //  发群图片
    businessType = webim.UPLOAD_PIC_BUSSINESS_TYPE.GROUP_MSG;
  }
  const opt = {
    file, //  图片对象
    onProgressCb, //  上传图片进度条回调函数
    //  'abortButton': document.getElementById('upd_abort'), //  停止上传图片按钮
    From_Account: userInfo.sigName, //  发送者帐号
    To_Account, //  接收者
    businessType //  业务类型
  };

  return new Promise((resolve, reject) => {
    //  上传图片
    webim.uploadPic(opt,
      (resp) => {
        //  上传成功发送图片
        onSendPic(resp, To_Account, headerUrl).then((picInfo) => {
          resolve(picInfo);
        }).catch((error) => {
          reject(error);
        });
      },
      (error) => {
        reject(error);
      }
    );
  });
}


/**
 * function getRecentContactList
 * 获取最近会话
 *
 * @param {object} 【options】 拉取会话配置 选填
 *     Count {number} 拉取会话数量，默认最大拉取1000条
 *
 * @return {Promise} resolve 返回会话Array
 *
 * */
export function getRecentContactList(options = { Count: 1000 }) {
  const err = validateErr('getRecentContactList');

  return new Promise((resolve, reject) => {
    if (err) {
      reject(err);
      return;
    }
    webim.getRecentContactList(
      options,
      (resp) => {
        if (resp.SessionItem && resp.SessionItem.length > 0) { // -如果存在最近会话记录
          const chatList = [];
          for (const item of resp.SessionItem) {
            const type = item.Type;// -接口返回的会话类型
            let sessionId = item.To_Account; // -会话id，私聊时为好友ID或者系统账号
            if (type === webim.RECENT_CONTACT_TYPE.C2C) { // -私聊
              if (sessionId === '@TIM#SYSTEM') { // -先过滤系统消息，，
                webim.Log.warn('过滤好友系统消息,sessionId=' + sessionId);
                continue;
              }
            } else {
              sessionId = item.ToAccount;// -
            }
            if (!sessionId) { // -会话id为空
              webim.Log.warn('会话id为空,sessionId=' + sessionId);
              continue;
            }
            if (sessionId === '@TLS#NOT_FOUND') { // -会话id不存在，可能是已经被删除了
              webim.Log.warn('会话id不存在,sessionId=' + sessionId);
              continue;
            }
            const singleMsg = {
              msg: item.MsgShow,
              id: sessionId,
              time: item.MsgTimeStamp// -消息时间戳
            };
            chatList.push(singleMsg);
          }
          resolve(chatList);
        }
      },
      () => {
        reject('error');
      }
    );
  });
}

/**
 * function getUnreadCountList
 * 获取消息未读数
 *
 * @return {Promise} resolve返回未读Array
 * */
export function getUnreadCountList() {
  return new Promise((resolve, reject) => {
    const err = validateErr('getUnreadCountList');

    if (err) {
      reject(err);
      return;
    }
    webim.syncMsgs(() => {
      const sessMap = webim.MsgStore.sessMap();
      const list = [];
      for (const key in sessMap) {
        const sess = sessMap[key];
        list.push({
          id: sess._impl.id,
          unread: sess._impl.unread,
          time: sess._impl.time
        });
      }
      resolve(list);
    });
  });
}

/**
 * function getEmotions
 * 获取表情列表
 *
 * @return {Array} 表情list
 * */
export function getEmotions() {
  const err = validateErr('getEmotions');
  if (err) {
    return [];
  }
  return webim.Emotions;
}


/**
 * function setAutoRead
 * 设置会话自动已读上报标志
 * @param {Boolean} isOn 是否将selSess的自动已读消息标志改为isOn，同时是否上报当前会话已读消息
 * @param {Boolean} isResetAll 是否重置所有会话的自动已读标志
 * @return:
 *   (无)
 */
export function setAutoRead(isOn = false, isResetAll = false) {
  const err = validateErr('setAutoRead');
  if (err) {
    return;
  }
  webim.setAutoRead(selSess, isOn, isResetAll);
}

export default {
  sdkLogin,
  sdkLogout,
  analysisMsg,
  getLastC2CHistoryMsgs,
  onSendMsg,
  uploadPic,
  getRecentContactList,
  getUnreadCountList,
  getEmotions,
  setAutoRead
};
