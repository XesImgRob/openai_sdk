/**
 created by wudan
 **/
 /*
流程:
1.点击开始
this.start-> iseEvent.start->1.recorderMethod.start->连接websocket
								 ->2.initmedia(初始化录音方法)->gotStream（采集音频）->complete（编码音频）->websocket.send(发送数据)
2.点击结束
this.stop->iseEvent.stop->iseEvent.stopRecord->recorderMethod.pause->1.lastblob=true,发送最后一包->websocket.onmessage(处理结果)
                                                                        ->2.5s 后检测重发 checkrepeat->resend->ajax(处理结果)
3.点击重发
this.resend->recorderMethod.resend->ajax resend(处理结果)
 */

var XueASR = (function (window, navigator) {
	// 测评需要变量
	var asrParam = {
		// websocket 地址
		"webscoketURL" : "",
		// 测评文本
		"text" : "",
		// pid
		"pid" : "",
		// 重发地址
		"resendURL" : "",
		// 试题id
		"testid" : "0",
		// 直播id
		"liveid" : "0",
		// 学生id
		"stuid" : "0",
		// 音频持续时间
		"audioTime" : '',
		// 用户浏览器信息，测评一般只支持谷歌/火狐浏览器
		"userAgent" : navigator.userAgent,
		// 是否重发
		"resend" : '',
		// 重发检测间隔
		"resendInterval" : ''
 	}
	// sid 每条语音唯一标识
	var sid = "";
	// websocket是否超时
	var websocketOvertime = true; 
	// 是否收到后台返回数据
	var	receiveMes = false;
	var audioStream = null;
	// 回调
	var callback = {};
	// webworker 地址
	var recordWorkerPath = '../../js/check-volume.js';
	var encodeWorkerPath = '../../js/worker-realtime.js';
	
    // 随机获取sid
    var getSID = function () {
    	var s = [];
        var hexDigits = "0123456789abcdef";
        for (var i = 0; i < 36; i++) {
            s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
        }
        s[14] = "4";  // bits 12-15 of the time_hi_and_version field to 0010
        s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);  // bits 6-7 of the clock_seq_hi_and_reserved to 01
        s[8] = s[13] = s[18] = s[23] = "-";
        var uuid = s.join("");
        var Timestamp=new Date().getTime();
        uuid=uuid+"_"+stuid+'_'+Timestamp;
        return uuid;
    }

    // 检测音量大小 webworker
    var newRecorderWorker = function (path) {
        var recorderWorker = new Worker(path);
        recorderWorker.onmessage = function (e) {
        	// 当拿到分贝值时，给音频检测函数判断
            volumeCheck.listen(e.data.volume)
            // 将当前音量返回给业务处理js，用于绘制音量条
            callback.onVolume(e.data.volume);
        };
        // 初始化
        var init = function (sampleRate) {
            recorderWorker.postMessage({
                command: 'init',
                config: {
                    sampleRate: 44100,
                    outputBufferLength: 1024
                }
            }); 
        };

        // 重置
        var reset = function () {
            recorderWorker.postMessage({command: 'reset'});
        };

        // 发送音频进行编码
        var sendData = function (data) {
            recorderWorker.postMessage({
                command: 'record',
                buffer: data
            });
        };

        return {
            "init": init,
            "reset": reset,
            "sendData": sendData
        }
    };

    // 编码MP3 webworker
    var newEncodeMp3worker = function (path) {
		var encodeMp3worker = new Worker(path);

		var flatten = function  (arr) {
			var arrA = []
			for (var i = 0; i<arr.length; i++){			
				for (var j = 0; j< arr[i].length; j++){
					arrA.push(arr[i][j])
				}
			}
			return arrA
		}

	    // 接收到编码完的MP3数据
   	    encodeMp3worker.onmessage = function (e) {
	      switch (e.data.cmd) {
			case 'end':
				// console.log('e.data', e.data);
				recorderMethod.lastBUffer(e.data.buf)
				console.log('e.data.buf', e.data.buf)
				var dataStr = e.data.buf

				var koko = flatten(dataStr)
				recorderMethod.complete(koko);
	          	break;
	        case 'error':
	          console.log('error');
	          break;
	        default :
	          console.log('I just received a message I know not how to handle.', e.data);
	      }
		};
		

        // 初始化
        var init = function (sampleRate) {
            encodeMp3worker.postMessage({
	        cmd: "init",
		        config: {
		            numChannels: 1,
		            sampleBits: 16,
		            inputSampleRate: 48000,
		            outputSampleRate: 48000,
		            bitRate: 128
		        }
		    });
        };

        // 发送音频进行编码
        var encode = function (data) {
            encodeMp3worker.postMessage({ cmd: "encode", buf: data });
        };

        return {
            "init": init,
            "encode": encode
        }
    }

	// websocket相关函数
	var websocketMethod=( function () {
		// 关闭websocket
		var onclose = function (e) {
			console.log('websocket close');
			console.log(e);
			websocket.close();
			iseEvent.stop();
		};
		
		// websocket 连接成功
		var onopen = function () {
			websocketOvertime = false;
			console.log('连接成功');
			fileList = [];
		};

		// websocket收到后台传来信息
		var onmessage = function (obj) {
			var result = JSON.parse(obj.data);
			recorderMethod.analysisResult(result)
		};

		// websocket 出现错误
		var onerror = function (evt) {
			console.log('websocket error');
			console.log(evt);
			iseEvent.stop();		
			// 判断是否超时
			// 当发起websocket链接申请以后，如果没有走onopen，直接onerror，则超时
			if (websocketOvertime) {
				callback.onError(9,"1131");
			} else {
				callback.onError(9,"1132");
			}
		}
		return {
			"onclose":onclose,
			"onopen":onopen,
			"onmessage":onmessage,
			"onerror":onerror
		}
	})(); 

    // 录音相关函数
	var recorderMethod=(function(){
		// 当前录音文件
		var	recorderFile;
		// 当前发送内容
		var	sendFile;
		// 将发送的标识数据转化为blob后的文件
		var	strblob;
		// 发送的标识数据
		var	sendstr = '';
		// 是否点击过开始
		var	firstClick = false;
		// 是否是当前文本的最后一个数据包
		var	lastBlob = false;
		// 当次录音是否结束
		var	finish = false;
		// 当前sid是否已经发了负包，如果已发送，则不再发包
		var	finishSid = "";
		// 当前合包的音频数据
		var	mergeData = '';
		// 暂存当web socket没连上的时候的音频数据
		var	saveData = [];
		//当前发送的数据顺序，负值表示最后一个数据包
		var	idx = "1";
		// 当次录音全部音频
		var mp3Blob = '';
	    // 音量条相关变量
    	var volumeSource = '';
    	var volumeScriptNode = '';
    	// 录音相关变量
    	var recordSource = '';
    	var recordScriptNode = '';
		// 正在录音标志
		var	recording = false;
		// 发送最后一个信息包的标志位
		var sendLastMes = false;
		// 重发定时器返回id
		var resendId = '';
		// 重发是否成功标识
		var resendSuccess = false;
		// 是否重发当前数据
		var	repeat = false;
		// 存储原始音频数据
		var	fileList = [];	    
	    // 存储AudioContext对象
	    var audioCtx = null;
	    // 是否是302错误。302表示长静音，业务会单独处理，不标记为错误。
		var	error_302 = false;
		// 当前发送所有数据是否得到返回结果
		var	success = false;
		// 检查是否重发定时器ID
		var	repeatId = "";
		// 所有发送数据是否得到返回值的标记数组
		var	fileState = ['true'];
		var bufferToString;
		var wrapArray = []
		
		
		var lastBUffer = function(data) {
			recorderFile = new Blob(data, {"type": "audio/mp3"});
			// 保存所有音频数据到mp3Blob			
			mp3Blob = new Blob([mp3Blob, recorderFile]);
			console.log('mp3Blob-', data, mp3Blob)
		}

    	// 接收到编码为MP3的数据后发送
		var complete = function (data) {	
			// 当前sid如果发送过负包，则相同sid则不再发送
            if (finish) {
            	if (sid == finishSid) {
            		console.log('finishSid');
            		return ;
            	}
			}
           	// 当lastblob为true，将idx置为-
            if (lastBlob) {
            	console.log("停止录制音频");
            	// 当idx是数字，置为负，否则返回
            	if (parseInt(idx) > 0) {
            		console.log("lastBlob2");
	                idx='-'+idx;
	                recording = false;
	                sendLastMes = true;
            	} else {
            		recording = false;
            		console.log("lastBlob3");
            		return;
            	}
			}
			console.log('传进来的文案',  asrParam.text)
            // 已合够规定包数，进行发包
			bufferToString = utils.arrayBufferToBase64(data)
			sendstr = {
				"common": {
					"sid": sid,
					"idx": idx,
					"compress": "2"
				},
				"spec": {
					"assess_ref": asrParam.text,
					"vad_max_sec": "15",

					"vad_pause_sec": "3",
			
					"vad_st_sil_sec": "5",
			
					"sil_tips_sec": "200",
			
					"voiceless_penal": "1",
			
					"multi_sent_loop": asrParam.multi_sent_loop,
			
					"need_out_wd_sec": "0",
					"extra":{
						"testid":asrParam.testid,
						"liveid":asrParam.liveid
					}
				},
				"audio": bufferToString
			}
			sendFile = JSON.stringify(sendstr)
			fileList.push(data);
			data = '';
			fileState.push('false');
			if (parseInt(idx) <= 0) {
				idx = "1";
				finish = true;
				finishSid = sid;
			}else{
				idx = (Number(idx)+1).toString();
			}  
			sendRecord();
			
		}
		// 开始录音
		var start = function () {
			// 连接websocket
			if('undefined' == typeof (websocket) || websocket.readyState != 1){
				websocketOvertime = true;
				// 线上
				websocket = new WebSocket(asrParam.webscoketURL);
				// 客户端与服务端连接成功后触发
				websocket.onopen = websocketMethod.onopen;
				// 接受到服务端传来的消息
				websocket.onmessage = websocketMethod.onmessage;
				// 如果连接失败，发送、接收数据失败或者处理数据出现错误触发
				websocket.onerror = websocketMethod.onerror;
				// 接收到服务端传来的关闭请求后触发
				websocket.onclose = websocketMethod.onclose;
			}
			// 初始化相关变量
			mp3Blob = '';
		    saveData = []; 
			sid = getSID();
			fileState = ["true"];
			idx = "1";
			fileList = [];
			error_302 = false;
			recording  =  true;
			lastBlob = false;
			repeat = false;
			sendLastMes = false;
			firstClick = false;
			finish = false;
			asrParam.audioTime = 0;
		}
		// 停止录音方法
		var stop = function () {
			// 停止
			if (source) source.disconnect();
            if (processor) processor.disconnect();
		}
		// 停止保存当前音频
		var pause = function () {
			lastBlob = true;
			// 当重发标志位为false时，检测是否重发
			if (!repeat && asrParam.resend) {
				// 检测是否重发
				repeatId = setTimeout(checkrepeat, asrParam.resendInterval);	
			}
		}
		// 检查是否重发
		var checkrepeat = function () {
			// 302不重发
			if (error_302) {
				clearInterval(repeatId);
				return ;
			}
			success = true;
			// 当有一个没有收到结果时，进行重发，根据fileState全部是否是true判断
			for (var i = 0; i < fileState.length; i++) {
				if (fileState[i] == "false") {
					success = false;
					repeat = true;
				}
			}
			// 当标志位都为ture并且收到了返回结果
			// 不进行重发
			if (success == true || receiveMes == true) {
				clearInterval(repeatId);
			}
			//重发
			if (success == false || receiveMes == false) {
				console.log('repeat');
				// resend();
			}else{
				success = true;
			}
		}
		// 发送录制的音频
		var sendRecord = function () {
			// 当websocket是连接状态时，发包
			if (websocket.readyState == '1') {
				// 当前有未发送的数据，先发送此数据
				if (saveData.length != 0) {
					for(var i = 0; i < saveData.length; i++) {
						websocket.send(saveData[i]);
						console.log('发送未发送数据'+saveData[i]);
					}
					saveData=[];
				}
				// 发包
				console.log('----------------', sendFile)
				websocket.send(sendFile);
			} else {
				// 当未连接时，暂存数据
				saveData.push(sendFile);
				console.log('存储未发送数据');
			}
		};
		// 获取mp3音频
		var getMp3Blob = function () {
			// 获取MP3音频
			return mp3Blob;
		};

		var initMedia = function () {
			var constraints = {
				audio: true
			};
			if (audioCtx == null) {
				audioCtx = new window.AudioContext();
			}
			// 获得跨浏览器兼容方法，成功走gotstream回调
			navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia ||
				navigator.msGetUserMedia || window.getUserMedia;
			if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
				navigator.mediaDevices.getUserMedia(constraints).then(gotStream)['catch'](
					function(e) {
						// todo err
						console.log(e);
					}
				);
			} else if (navigator.getUserMedia) {
				navigator.getUserMedia(constraints, gotStream, function(e) {
					// todo err
					console.log(e);
				});
			} else {
				console.log('Not support userMedia');
			}
		};

		// 成功回调，stream为当前获取音频流   
	    var gotStream = function (stream) {
	        audioStream = stream;

	        // 用于音量条音频，录制音频少，触发频率高
	        try{
	        	volumeSource = audioCtx.createMediaStreamSource(stream);
	        }catch(err){
	        	callback.onError(15,15);
	        	return;
	        }
	        volumeScriptNode = audioCtx.createScriptProcessor(1024, 1, 1);
	        recorderWorker.init(audioCtx.sampleRate);
	        
	        // 当有音频时触发回调函数
	        volumeScriptNode.onaudioprocess = function (e) {
	            if (!recording) return;
	            // console.log('stream1');
	            // 将当前音频发送给web worker 进行检测音量
	            recorderWorker.sendData(e.inputBuffer.getChannelData(0));
	        };

	        volumeSource.connect(volumeScriptNode);
			volumeScriptNode.connect(audioCtx.destination);
			

			

	        // 用于发送音频数据
			recordSource = audioCtx.createMediaStreamSource(stream);
	        recordScriptNode=audioCtx.createScriptProcessor(16384,1,1);

			// 当有录音数据时触发
	        recordScriptNode.onaudioprocess = function (e) {
	            if (!recording) return;
	            // console.log('stream2'); 
	            // 编码为MP3格式数据
	            encodeMp3worker.encode(e.inputBuffer.getChannelData(0));
	        };

	        recordSource.connect(recordScriptNode);
	        recordScriptNode.connect(audioCtx.destination);

	        iseEvent.start();
	    };

	    // 处理结果
		var analysisResult = function (result) {
			console.log('analysisResult', result);
			// 处理出错
	    	if(result.code !== 0 && (result.data == null || result.data == 'undefined')){
	    		// console.log(result.errorCode);
	    		iseEvent.stop();
				checkStatus(result.code, result.msg);
				return;		    		
	    	}else{
	    		// 判断当前返回结果与发出sid是否相同。
	    		// 如果不一样，舍弃本条结果
	    		// 不一样的情况，一般发生在重发以后，上次的结果才返回
		    	if(result.data.common.sid){
		    		if(sid!=result.data.common.sid){
		    			console.log(sid);
		    			console.log(result.data.common.sid);
		    			console.log('不是当前数据');
		    			return ;
		    		}
		    	}
	    	}

	    	// 当返回结果为正常值的时候，修改状态值
	    	var index = Math.abs(result.data.common.idx);
    		// 表示已收到当前包的结果
    		if (result.data.common.err_no == 0 && index >= 0) {
    			fileState[index]='true';
    		}
			console.log('-result---', result.data)
			if(asrParam.multi_sent_loop === '0'){
				if(result.data.spec.evl_flag === "fnl") { // 结束
					wrapArray.push(result.data)
					if(wrapArray.length>0){
						callback.onResult(wrapArray)
					} else {
						callback.onResult(`请按提示语朗读哦~~`)
					}
					
				}
			}else if(asrParam.multi_sent_loop === '1'){
				var showIndex = result.data.spec.new_sen_idx
				if(showIndex >= 0){
					wrapArray.push(result.data)
					
				}
				if(result.data.spec.evl_flag === "fnl") { // 结束
					if(wrapArray.length>0){
						callback.onResult(wrapArray)
					} else {
						callback.onResult(`请按提示语朗读哦~~`)
					}
				}
			}
			// callback.onResult(result)
		}
		// 检查返回结果状态码
		// 当出错时，返回对应错误码
		var checkStatus = function (status, msg) { 
			// 错误码：
			// 16014  socket接收失败
			//16105	没有sid或者idx，或者在需要assess_ref的业务中没有传
			//16106	音频数据为空
			//16015	拉学生名单错误
			// 16016	解码器返回超时，比如端长时间占用连接
			//16017	Sid提前结束
			//16018	解码器目前繁忙
			//16107	音频格式错误
			//16108	评测文本格式错误，如出现了违规字符
			//16019	解码器返回数据无有效声音
			//16020	pcm错误			
			// 0：成功
			if (status == 0) return;

			if (status == '1302') error_302 = true;
			// 停止录音
			iseEvent.stop();
			// 错误回调
			callback.onError(msg);		
		}
		return {
			"start":start,
			"stop":stop,
			"pause":pause,
			"complete":complete,
			"getMp3Blob": getMp3Blob,
			"initMedia": initMedia,
			"analysisResult": analysisResult,
			"checkStatus": checkStatus,
			"lastBUffer":lastBUffer
		} 
	})();


    var iseEvent = (function () {
    	// 开始录音
        var start = function () {
            // 第一次触发录音
            if (audioStream == null) {
                // 初始化 getUserMedia
                recorderMethod.initMedia();
                // 初始化音量检测 webWorker
                recorderWorker.init();
                // 初始化编码音频 webWorker
                encodeMp3worker.init();
                return;
            }
            // callback回调
            callback.onProcess('onRecord');
            // 开启音量检测
            volumeCheck.start();
            // 重置音量检测 webWorker
            recorderWorker.reset();
            // 开始录音
            recorderMethod.start();
        };
        // 停止
        var stop = function () {
        	// 回调状态
        	callback.onProcess('onStop');
        	// 暂停录音
            recorderMethod.pause();
            // 停止音量检测
            volumeCheck.stop();
        };
        // 保存录制音频
		var getMp3Blob = function () {
			return recorderMethod.getMp3Blob();
		}
        return {
            "start": start,
            "stop": stop,
            "getMp3Blob": getMp3Blob
        };
    })();

	// 检测音量大小
    var volumeCheck = (function(){
    	//音量过小
        var lowVolumeLimit = 8;
        //音量判定间隔
        var interval = 500;
        //录音开始多少判定点提示音量过小
        var maxTooLow = 5;
        var maxVolume = 0;
        var checkEventId = 0;

        var isTooLow = false;
        var tooLowCount = 0;

        var init = function(){
            maxVolume = 0;
            isTooLow = false;
            tooLowCount = 0;
        };
        var fire = function(){
            if(!isTooLow && maxVolume <lowVolumeLimit){
                tooLowCount++;
                if(tooLowCount >= maxTooLow){
                    isTooLow = true;
                    callback.onProcess("lowVolume");//音量太小
                }
                return
            }
            if(isTooLow && maxVolume >= lowVolumeLimit){
                callback.onProcess("normalVolume");//正常音量
            }
            if(maxVolume >= lowVolumeLimit){
                clearInterval(checkEventId);//一旦恢复正常，结束
                tooLowCount = 0;
            }
        };

        var start = function(){
            init();
            checkEventId = setInterval(fire,interval);
        };

        var stop = function(){
            clearInterval(checkEventId);
        };

        var listen = function(volume){
            maxVolume = Math.max(maxVolume,volume);
        };

        return {
            "start":start,
            "stop":stop,
            "listen":listen
        }
    })();

    // 工具类
    var utils = {
		"arrayBufferToBase64": function(buffer){
			var binary = '';
			var bytes = new Uint8Array(buffer);
			var len = bytes.byteLength;
			for (var i = 0; i < len; i++) {
				binary += String.fromCharCode(bytes[i]);
			}
			return window.btoa( binary );
		},
    	// 合包参数
    	"extendParam" : function (params_obj) {
    		// console.log(params_obj)
            asrParam.text = params_obj.ise_word.replace(/\n+/g,' ');
            asrParam.webscoketURL = params_obj.webscoketURL || 'wss://asr.xueersi.com/wsh5'
            asrParam.pid = params_obj.pid || '1103101';
            asrParam.testid = params_obj.testid || "1";
            asrParam.liveid = params_obj.liveid || "1";
			asrParam.stuid = params_obj.stuid || 1;
			asrParam.multi_sent_loop = params_obj.multi_sent_loop || 0;
    	},
    	// 检测是否支持相关方法
    	"checkIsSupport": function () {
            if (!navigator.getUserMedia) {
                return false;
            }
            if (!window.AudioContext) {
                return false
            }
            if (!window.Worker) {
                return false
            }
            if (!window.URL){
                return false;
            }
            // IE
            if (!!window.ActiveXObject || "ActiveXObject" in window){
            	return false;
            }

            if (window.navigator.userAgent.indexOf("MSIE")>=0) {
            	return false;
            }

            if(window.navigator.userAgent.indexOf("compatible") > -1 && window.navigator.userAgent.indexOf("MSIE") > -1 && !window.navigator.userAgent.indexOf('Opera')){
            	return false;
            }

            return true;
        }
    }
    
    return function (setting) {
    	// 绑定回调
    	callback = setting.callback;
    	recorderWorker = newRecorderWorker(recordWorkerPath);
		encodeMp3worker = newEncodeMp3worker(encodeWorkerPath);
  
		// 当前浏览器是否支持录音方法	
        this.isSupport = function () {
			return utils.checkIsSupport()
		}

		// 如果当前浏览器不支持录音相关方法，返回
		if (!utils.checkIsSupport()) {
			return;
		}

		// 获取MP3音频
		this.getMp3Blob = function () {
			return iseEvent.getMp3Blob();
		};

		// 开始
        this.start = function (params_obj) {
        	// 回调状态
        	callback.onProcess('onStart')
        	// 合并变量
        	utils.extendParam(params_obj)
            iseEvent.start();
        };

        // 结束
        this.stop = function () {
            iseEvent.stop();
        };
    }
})(window, navigator);
