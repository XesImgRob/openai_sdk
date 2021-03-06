var sdkdemo = require('../../lib/newdatatest/newdatatest.js')
// pages/newpage/newpage.js
Page({

  /**
   * 页面的初始数据
   */
  data: {
    postList: sdkdemo.showdata,
  },
  /**
    * 初始化方法
    */
  initsystem: function () {
    getApp().globalData.testResult = [];
    this.onLoad();
  },
  /**
  * 点击原音按钮
  */
  bindNative: function () {
    sdkdemo.playRecording(this)  //  唤起接口
  },
  /**
  * 点击录音按钮
  */
  bindRecord: function () {
    sdkdemo.clickRecording(this)  //  唤起接口
  },
  /**
 * 生命周期函数--监听页面加载
 */
  onLoad: function (options) {
    // 1 英文 2 中文
    let ceping = 2        
    // 测评对照阅读的文本    英文例句  Whatever is worth doing is worth doing well.
    let cpinfo = '任何值得做的，就把它做好'  
    // 测评参考录音       英文例句地址    http://111.206.170.217:12001/ai/audios/Example-en.mp3
    let cpluyinurl = 'http://111.206.170.217:12001/ai/audios/Example-zh.mp3'
    //接入方式 1快速接入  2安全接入
    let access_mode = 1
    //app_key
    let app_key = '8102b22a5e81e840176d9f381ec6f837'
    //app_secret
    let app_secret = 'f308ce31e42e366093c01e5283f1acc02c2cd47492f5c8633b55d58930be2b2c'

    //默认30s, 最大说话时长，最大可设置90s 
    let vad_max_sec = '90';
    // 默认5s, 说话后静音停止时间
    let vad_pause_sec = '3';
    //默认为10s, 说话前最大静音时长
    let vad_st_sil_sec = '3';
    //静音时长提示，单位是10ms  
    let sil_tips_sec = '200';
    //清音惩罚选项，测评单词时对清音发音好坏更敏感
    let voiceless_penal = '1';
    //单句测评与多句测评模式选项，多句测评模式置为1 单句测评为0
    let multi_sent_loop = '0';

    //  初始化数据 
    let initData = {
      "ceping": ceping,
      "cpinfo": cpinfo,
      "cpluyinurl": cpluyinurl
    };
    //  接入方式数据
    let accessModeData = {
      "access_mode": access_mode,
      "app_key": app_key,
      "app_secret": app_secret
    }
    let initAiData = {
      "vad_max_sec": vad_max_sec,
      "vad_pause_sec": vad_pause_sec,
      "vad_st_sil_sec": vad_st_sil_sec,
      "sil_tips_sec": sil_tips_sec,
      "voiceless_penal": voiceless_penal,
      "multi_sent_loop": multi_sent_loop
    }
    sdkdemo.showtest(this, initData, accessModeData, initAiData)
  },
  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady: function () {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide: function () {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload: function () {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh: function () {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom: function () {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage: function () {

  }
})