/**
 * 模版插件
 */
const electron = require('electron');
const remote = electron.remote;
const BrowserWindow = electron.remote.BrowserWindow;

define(function () {
    var sticky_note = {
        langs: {
            'en-us': {
                'stickyNote': 'Sticky Edit',
            },
            'de-de': {
                'stickyNote': 'Notizen bearbeiten',
            },
            'zh-cn': {
                'stickyNote': '便签编辑',
            },
            'zh-hk': {
                'stickyNote': '便簽編輯',
            },
            'ja-jp': {
                'stickyNote': 'ノート編集',
            }
        },

        getMsg: function (txt, data) {
            return Api.getMsg(txt, 'plugin.sticky_note', data)
        },

        // active sticky notes
        _stickyCounter: 0,
        _activeSticky: {},

        // open the stick nots
        open: function (sNote) {
            var me = this;
            if (me._stickyCounter > 3) {
                // just allow one sticky note
                return false;
            }
            if (sNote && !sNote.IsMarkdown) {
                // prepare window
                me.childWindow = new BrowserWindow({
                    width: 550,
                    height: 400,
                    title: 'Sticky Note',
                    autoHideMenuBar: true,
                    frame: false
                });

                // collect
                var winContent = me.childWindow.webContents;
                var stickyData = {
                    window: me.childWindow,
                    webContents: winContent,
                    initialized: false,
                    note: sNote
                };
                me._activeSticky[winContent.id] = stickyData;
                me._stickyCounter = me._stickyCounter + 1;

                // initialize window
                winContent.once('dom-ready', () => {
                    var sticyData = me._activeSticky[winContent.id];
                    if (sticyData.initialized) {
                        return;
                    }
                    // set the button functions
                    // console.log('\n----Ready------\n' + winContent.id + '\n-----------\n');
                    winContent.executeJavaScript(`
                        var electron = require('electron');
                        var remote = electron.remote;
                        var BrowserWindow = electron.remote.BrowserWindow;
                        document.getElementById("min-btn").addEventListener("click", function (e) {
                            var window = BrowserWindow.getFocusedWindow();
                            window.minimize();
                        });
                        document.getElementById("max-btn").addEventListener("click", function (e) {
                            var window = BrowserWindow.getFocusedWindow(); 
                            if (window.isMaximized()) {
                                window.unmaximize();
                            } else {
                                window.maximize(); 
                            }
                        });
                        document.getElementById("close-btn").addEventListener("click", function (e) {
                            var window = BrowserWindow.getFocusedWindow();
                            window.close();
                        }); 
                        document.getElementById("pin-btn").addEventListener("click", function (e) {
                            var window = BrowserWindow.getFocusedWindow();
                            window.setAlwaysOnTop(!window.isAlwaysOnTop());
                        }); 
                    `);

                    // set the lisener
                    var jsToExec = `
                        var {ipcRenderer, remote} = require('electron'); 
                        ipcRenderer.on('content-set', (event, arg) => {  
                            var myTitle = document.getElementById("title");
                            myTitle.textContent = arg.title;
                            tinymce.activeEditor.setContent(arg.content);
                            tinymce.isNotDirty = 1;
                            tinymce.activeEditor.shortcuts.add("ctrl+s", "Save Content", function() {
                                var sendData = {
                                    winContentId: <CID>,
                                    htmlContents: tinymce.activeEditor.getContent(),
                                    isDirty: tinymce.activeEditor.isDirty(),
                                };
                                ipcRenderer.send('need-save', sendData);
                            });
                        });
                        let mainValue = ipcRenderer.send('init-done', <CID>);
                        `;
                    jsToExec = jsToExec
                        .replace(/<CID>/g, winContent.id.toString());
                    winContent.executeJavaScript(jsToExec,
                        function (result) {
                        });
                    me._activeSticky[winContent.id].initialized = true;
                });

                // window is closed
                me.childWindow.on('close', function (e) {
                    // send back final content
                    // console.log('\n----Close------\n' + winContent.id + '\n-----------\n');
                    var jsToExec = `
                        var {ipcRenderer, remote} = require('electron'); 
                        var myContent = document.getElementById("myContent");
                        var sendData = {
                            winContentId: <CONTENT_ID>,
                            htmlContents: tinymce.activeEditor.getContent(),
                            isDirty: tinymce.activeEditor.isDirty(),
                        };
                        ipcRenderer.send('win-closed', sendData);
                        `;
                    jsToExec = jsToExec
                        .replace("<CONTENT_ID>", winContent.id.toString());
                    winContent.executeJavaScript(jsToExec,
                        function (result) {
                            // console.log(result)
                        });
                });

                // window is moving
                // me.childWindow.on('blur', function (e) {
                //     // hide if it 
                //     // console.log('\n----Blur------\n' + winContent.id + '\n-----------\n');
                //     var sData = me._activeSticky[winContent.id];
                //     me.autoDocking(winContent.id, function (status) {
                //         if (status) {
                //             console.log('\n----Docked------\n');
                //         }
                //     });
                // });

                // me.childWindow.on('focus', function (e) {
                //     // hide if it 
                //     // console.log('\n----Blur------\n' + winContent.id + '\n-----------\n');
                //     var sData = me._activeSticky[winContent.id];
                //     if (sData.dock) {
                //         var dockData = sData.dock;
                //         if (dockData.isDock) {
                //             var curWin = sData.window;
                //             curWin.setPosition(dockData.x2, dockData.y2);
                //             me._activeSticky[winContent.id].dock.isDock = false;
                //         }
                //     }
                // });

                // communications
                var ipc = remote.ipcMain;
                ipc.on('win-closed', (event, arg) => {
                    // Print 1
                    var sticyData = me._activeSticky[arg.winContentId];
                    if (sticyData) {
                        //if (arg.isDirty) {
                        var pNote = sticyData.note;
                        pNote.Content = arg.htmlContents;
                        Api.noteService.updateNoteOrContent(pNote, function (insertedNote) {
                            Api.note.setNoteDirty(pNote.NoteId, true);
                            return true;
                        }, true); // the last param to history
                        //}

                        // mark for delete
                        me._activeSticky[arg.winContentId] = null;
                        me._stickyCounter = me._stickyCounter - 1;
                    }
                    // reference
                    // http://electron.rocks/different-ways-to-communicate-between-main-and-renderer-process/
                });

                ipc.on('init-done', (event, arg) => {
                    // sent
                    var contentId = arg;
                    var sticyData = me._activeSticky[contentId];
                    var myWebContent = sticyData.webContents;
                    var myNoteData = sticyData.note;
                    var noteData = {
                        title: myNoteData.Title,
                        content: myNoteData.Content,
                    };
                    myWebContent.send('content-set', noteData);
                });

                ipc.on('need-save', (event, arg) => {
                    // sent
                    var sticyData = me._activeSticky[arg.winContentId];
                    if (sticyData) {
                        //if (arg.isDirty) {
                        var pNote = sticyData.note;
                        pNote.Content = arg.htmlContents;
                        Api.noteService.updateNoteOrContent(pNote, function (insertedNote) {
                            Api.note.setNoteDirty(pNote.NoteId, true);
                            return true;
                        }, false); // the last param to history
                    }
                });

                // now show the window
                me.childWindow.show();
                var localURL = 'file://' + __dirname + "/public/plugins/sticky_note/index.html"
                me.childWindow.loadURL(localURL);
            }
            // note is null or markdown
        },

        // auto docking
        autoDocking: function (contentId, callback) {
            var sData = this._activeSticky[contentId];
            if (sData) {
                // get size
                var curWin = sData.window;
                var winPos = curWin.getPosition();
                var winSize = curWin.getSize();
                var display = electron.screen.getPrimaryDisplay();
                var dispSize = [
                    display.workAreaSize.width,
                    display.workAreaSize.height,
                ];

                // determine docking point
                var sizeRemain = 50;
                var dockData = {
                    isDock: false,
                    dir: 'left',
                    x0: 0,
                    x1: 0,
                    x2: 0,
                    y0: 0,
                    y1: 0,
                    y2: 0,
                    w: winSize[0],
                    h: winSize[1],
                    screenW: dispSize[0],
                    screenH: dispSize[1],
                };
                if (winPos[1] < 0) {
                    dockData.isDock = true;
                    dockData.dir = 'top';
                    dockData.x0 = 0;
                    if (winPos[0] > 0) dockData.x0 = winPos[0];
                    if (winPos[0] + winSize[0] > dispSize[0]) {
                        dockData.x0 = dispSize[0] - winSize[0];
                    }
                    dockData.x1 = dockData.x0;
                    dockData.x2 = dockData.x0;
                    dockData.y0 = 0;
                    dockData.y1 = -(winSize[1] - sizeRemain);
                    dockData.y2 = dockData.y0 - 1;
                } else if (winPos[0] < 0) {
                    dockData.isDock = true;
                    dockData.dir = 'left';
                    dockData.x0 = 0;
                    dockData.x1 = -(winSize[0] - sizeRemain);
                    dockData.x2 = dockData.x0 - 1;
                    dockData.y0 = 0;
                    if (winPos[1] > 0) dockData.y0 = winPos[1];
                    if (winPos[1] + winSize[1] > dispSize[1]) {
                        dockData.y0 = dispSize[1] - winSize[1];
                    }
                    dockData.y1 = dockData.y0;
                    dockData.y2 = dockData.y0;
                } else if (winPos[0] + winSize[0] > dispSize[0]) {
                    dockData.isDock = true;
                    dockData.dir = 'right';
                    dockData.x0 = dispSize[0] - winSize[0];
                    dockData.x1 = dispSize[0] - sizeRemain;
                    dockData.x2 = dockData.x0 - 1;
                    dockData.y0 = 0;
                    if (winPos[1] > 0) dockData.y0 = winPos[1];
                    if (winPos[1] + winSize[1] > dispSize[1]) {
                        dockData.y0 = dispSize[1] - winSize[1];
                    }
                    dockData.y1 = dockData.y0;
                    dockData.y2 = dockData.y0;
                }
                // console.log('\n----------- onDock -----------\n');
                // console.log(winPos[0]);
                // console.log(winSize[0]);
                // console.log(dispSize[0]);

                // now dock the window
                if (dockData.isDock) {
                    curWin.setPosition(dockData.x1, dockData.y1);
                    this._activeSticky[contentId].dock = dockData;
                }
                callback(true);
            }
            else {
                callback(false);
            }
        },

        // app 打开前
        onOpen: function () {
            var me = this;
            var gui = Api.gui;

            var menu = {
                label: me.getMsg('stickyNote'),
                enabled: function (note) {
                    return (note && !note.IsMarkdown);
                },
                click: (function () {
                    return function (note) {
                        me.open(note);
                    }
                })()
            };

            // 设置
            Api.addUserNoteMenu(menu);
        },

        // app 打开后
        onOpenAfter: function () {
        },

        // 关闭时需要运行的
        onClose: function () {
        }
    };
    return sticky_note;
});