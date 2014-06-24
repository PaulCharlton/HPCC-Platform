/*##############################################################################
#	HPCC SYSTEMS software Copyright (C) 2012 HPCC Systems.
#
#	Licensed under the Apache License, Version 2.0 (the "License");
#	you may not use this file except in compliance with the License.
#	You may obtain a copy of the License at
#
#	   http://www.apache.org/licenses/LICENSE-2.0
#
#	Unless required by applicable law or agreed to in writing, software
#	distributed under the License is distributed on an "AS IS" BASIS,
#	WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#	See the License for the specific language governing permissions and
#	limitations under the License.
############################################################################## */
define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/i18n",
    "dojo/i18n!./nls/hpcc",
    "dojo/_base/array",
    "dojo/dom",
    "dojo/dom-attr",
    "dojo/dom-construct",
    "dojo/dom-class",
    "dojo/dom-form",
    "dojo/date",
    "dojo/on",
    "dojo/topic",

    "dijit/registry",
    "dijit/Dialog",
    "dijit/Menu",
    "dijit/MenuItem",
    "dijit/MenuSeparator",
    "dijit/PopupMenuItem",
    "dijit/form/Textarea",
    "dijit/form/ValidationTextBox",

    "dgrid/editor",
    "dgrid/selector",
    "dgrid/tree",

    "hpcc/_TabContainerWidget",
    "hpcc/WsDfu",
    "hpcc/FileSpray",
    "hpcc/ESPUtil",
    "hpcc/ESPLogicalFile",
    "hpcc/ESPDFUWorkunit",
    "hpcc/DelayLoadWidget",
    "hpcc/TargetSelectWidget",
    "hpcc/FilterDropDownWidget",
    "hpcc/SelectionGridWidget",

    "put-selector/put",

    "dojo/text!../templates/DFUQueryWidget.html",

    "dijit/layout/BorderContainer",
    "dijit/layout/TabContainer",
    "dijit/layout/ContentPane",
    "dijit/form/Form",
    "dijit/form/DateTextBox",
    "dijit/form/TimeTextBox",
    "dijit/form/Button",
    "dijit/form/ToggleButton",
    "dijit/form/DropDownButton",
    "dijit/form/Select",
    "dijit/form/CheckBox",
    "dijit/Toolbar",
    "dijit/ToolbarSeparator",
    "dijit/TooltipDialog",
    "dijit/Fieldset",

    "hpcc/TableContainer"

], function (declare, lang, i18n, nlsHPCC, arrayUtil, dom, domAttr, domConstruct, domClass, domForm, date, on, topic,
                registry, Dialog, Menu, MenuItem, MenuSeparator, PopupMenuItem, Textarea, ValidationTextBox,
                editor, selector, tree,
                _TabContainerWidget, WsDfu, FileSpray, ESPUtil, ESPLogicalFile, ESPDFUWorkunit, DelayLoadWidget, TargetSelectWidget, FilterDropDownWidget, SelectionGridWidget,
                put,
                template) {
    return declare("DFUQueryWidget", [_TabContainerWidget, ESPUtil.FormHelper], {
        templateString: template,
        baseClass: "DFUQueryWidget",
        i18n: nlsHPCC,

        postCreate: function (args) {
            this.inherited(arguments);
            this.workunitsTab = registry.byId(this.id + "_Workunits");
            this.filter = registry.byId(this.id + "Filter");
            this.clusterTargetSelect = registry.byId(this.id + "ClusterTargetSelect");
            this.importForm = registry.byId(this.id + "ImportForm");
            this.importTargetSelect = registry.byId(this.id + "ImportTargetSelect");
            this.copyForm = registry.byId(this.id + "CopyForm");
            this.copyTargetSelect = registry.byId(this.id + "CopyTargetSelect");
            this.copyGrid = registry.byId(this.id + "CopyGrid");
            this.renameForm = registry.byId(this.id + "RenameForm");
            this.renameGrid = registry.byId(this.id + "RenameGrid");
            this.addToSuperFileForm = registry.byId(this.id + "AddToSuperfileForm");
            this.addToSuperfileGrid = registry.byId(this.id + "AddToSuperfileGrid");
            this.desprayForm = registry.byId(this.id + "DesprayForm");
            this.desprayTargetSelect = registry.byId(this.id + "DesprayTargetSelect");
            this.desprayGrid = registry.byId(this.id + "DesprayGrid");
        },

        startup: function (args) {
            this.inherited(arguments);
            this.initContextMenu();
            this.initFilter();
        },

        getTitle: function () {
            return this.i18n.title_DFUQuery;
        },

        //  Hitched actions  ---
        _onRefresh: function (event) {
            this.refreshGrid();
        },

        _onTree: function (event) {
            this.treeMode = this.widget.Tree.get("checked");
            this.refreshGrid();
            this.refreshActionState();
        },

        _onOpen: function (event) {
            var selections = this.workunitsGrid.getSelected();
            var firstTab = null;
            for (var i = selections.length - 1; i >= 0; --i) {
                var tab = this.ensureLFPane(selections[i].__hpcc_id, selections[i]);
                if (i == 0) {
                    firstTab = tab;
                }
            }
            if (firstTab) {
                this.selectChild(firstTab, true);
            }
        },

        _onDelete: function (event) {
            if (confirm(this.i18n.DeleteSelectedFiles)) {
                var context = this;
                WsDfu.DFUArrayAction(this.workunitsGrid.getSelected(), this.i18n.Delete).then(function(response) {
                    context.refreshGrid(true);
                });
            }
        },

        _handleResponse: function (wuidQualifier, response) {
            if (lang.exists(wuidQualifier, response)) {
                var wu = ESPDFUWorkunit.Get(lang.getObject(wuidQualifier, false, response));
                wu.startMonitor(true);
                var tab = this.ensureDFUWUPane(wu.ID, {
                    Wuid: wu.ID
                });
                return tab
            }
        },

        _onImportOk: function (event) {
            if (this.importForm.validate()) {
                var request = domForm.toObject(this.importForm.id);
                var context = this;
                FileSpray.Copy({
                    request: request
                }).then(function (response) {
                    context._handleResponse("CopyResponse.result", response);
                });
                topic.publish("hpcc/dfu_wu_created");
                registry.byId(this.id + "ImportDropDown").closeDropDown();
            }
        },

        _onCopyOk: function (event) {
            if (this.copyForm.validate()) {
                var context = this;
                arrayUtil.forEach(this.copyGrid.store.data, function (item, idx) {
                    var logicalFile = ESPLogicalFile.Get(item.NodeGroup, item.Name);
                    var request = domForm.toObject(context.id + "CopyForm");
                    request.RenameSourceName = item.Name;
                    request.destLogicalName = item.targetCopyName;
                    logicalFile.copy({
                        request: request
                    }).then(function (response) {
                        context._handleResponse("CopyResponse.result", response);
                    });
                });
                topic.publish("hpcc/dfu_wu_created");
                registry.byId(this.id + "CopyDropDown").closeDropDown();
            }
        },

        _onRenameOk: function (event) {
            if (this.renameForm.validate()) {
                var context = this;
                arrayUtil.forEach(this.renameGrid.store.data, function (item, idx) {
                    var logicalFile = ESPLogicalFile.Get(item.NodeGroup, item.Name);
                    var request = domForm.toObject(context.id + "RenameForm");
                    request.RenameSourceName = item.Name;
                    request.dstname = item.targetRenameName;
                    logicalFile.rename({
                        request: request
                    }).then(function (response) {
                        context._handleResponse("RenameResponse.wuid", response);
                    });
                });
                topic.publish("hpcc/dfu_wu_created");
                registry.byId(this.id + "RenameDropDown").closeDropDown();
            }
        },

        _onAddToSuperfileOk: function (event) {
            if (this.addToSuperFileForm.validate()) {
                var context = this;
                var formData = domForm.toObject(this.id + "AddToSuperfileForm");
                WsDfu.AddtoSuperfile(this.workunitsGrid.getSelected(), formData.Superfile, formData.ExistingFile).then(function(response) {
                    context.refreshGrid();
                });
                registry.byId(this.id + "AddtoDropDown").closeDropDown();
            }
        },

        _onDesprayOk: function (event) {
            if (this.desprayForm.validate()) {
                var context = this;
                arrayUtil.forEach(this.desprayGrid.store.data, function (item, idx) {
                    var request = domForm.toObject(context.id + "DesprayForm");
                    if (!context.endsWith(request.destPath, "/")) {
                        request.destPath += "/";
                    }
                    request.destPath += item.targetName;
                    item.despray({
                        request: request
                    }).then(function (response) {
                        context._handleResponse("DesprayResponse.wuid", response);
                    });
                });
                topic.publish("hpcc/dfu_wu_created");
                registry.byId(this.id + "DesprayDropDown").closeDropDown();
            }
        },

        _onRowDblClick: function (item) {
            var wuTab = this.ensureLFPane(item.__hpcc_id, item);
            this.selectChild(wuTab);
        },

        _onRowContextMenu: function (item, colField, mystring) {
            this.menuFilterOwner.set("disabled", false);
            this.menuFilterCluster.set("disabled", false);

            if (item) {
                this.menuFilterOwner.set("label", this.i18n.Owner + ":  " + item.Owner);
                this.menuFilterOwner.set("hpcc_value", item.Owner);
                this.menuFilterCluster.set("label", this.i18n.Cluster + ":  " + item.NodeGroup);
                this.menuFilterCluster.set("hpcc_value", item.NodeGroup);
            }
            if (item.Owner == "") {
                this.menuFilterOwner.set("disabled", true);
                this.menuFilterOwner.set("label", this.i18n.Owner + ":  " + this.i18n.NA);
            }
            if (item.NodeGroup == "") {
                this.menuFilterCluster.set("disabled", true);
                this.menuFilterCluster.set("label", this.i18n.Cluster + ":  " + this.i18n.NA);
            }
        },

        //  Implementation  ---
        getFilter: function () {
            var retVal = this.filter.toObject();
            lang.mixin(retVal, {
                StartDate: this.getISOString("FromDate", "FromTime"),
                EndDate: this.getISOString("ToDate", "ToTime")
            });
            return retVal;
        },

        //  Implementation  ---
        init: function (params) {
            if (this.inherited(arguments))
                return;

            this.clusterTargetSelect.init({
                Groups: true,
                includeBlank: true
            });
            var context = this;
            this.importTargetSelect.init({
                Groups: true
            });
            this.copyTargetSelect.init({
                Groups: true
            });
            this.desprayTargetSelect.init({
                DropZones: true,
                callback: function (value, item) {
                    registry.byId(context.id + "DesprayTargetIPAddress").set("value", item.machine.Netaddress);
                    registry.byId(context.id + "DesprayTargetPath").set("value", item.machine.Directory + "/");
                }
            });
            this.initWorkunitsGrid();

            this.filter.on("clear", function (evt) {
                context.refreshGrid();
            });
            this.filter.on("apply", function (evt) {
                context.refreshGrid();
            });
            topic.subscribe("hpcc/dfu_wu_completed", function (topic) {
                context.refreshGrid();
            });
        },

        initTab: function() {
            var currSel = this.getSelectedChild();
            if (currSel && !currSel.initalized) {
                if (currSel.id == this.workunitsTab.id) {
                } else {
                    if (!currSel.initalized) {
                        currSel.init(currSel._hpccParams);
                    }
                }
            }
        },

        addMenuItem: function (menu, details) {
            var menuItem = new MenuItem(details);
            menu.addChild(menuItem);
            return menuItem;
        },

        initContextMenu: function() {
            var context = this;
            var pMenu = new Menu({
                targetNodeIds: [this.id + "WorkunitsGrid"]
            });
            pMenu.addChild(new MenuItem({
                label: this.i18n.Refresh,
                onClick: function(args){context._onRefresh();}
            }));
            pMenu.addChild(new MenuSeparator());
            pMenu.addChild(new MenuItem({
                label: this.i18n.Open,
                onClick: function(args){context._onOpen();}
            }));
            pMenu.addChild(new MenuItem({
                label: this.i18n.Delete,
                onClick: function(args){context._onDelete();}
            }));
            pMenu.addChild(new MenuItem({
                label: this.i18n.AddToSuperfile,
                onClick: function(args){dijit.byId(context.id+"AddtoDropDown").openDropDown()}
            }));
            pMenu.addChild(new MenuSeparator());
            {
                var pSubMenu = new Menu();
                this.menuFilterOwner = this.addMenuItem(pSubMenu, {
                    onClick: function (args) {
                        context.filter.clear();
                        context.filter.setValue(context.id + "Owner", context.menuFilterOwner.get("hpcc_value"));
                        context.refreshGrid();
                    }
                });
                this.menuFilterCluster = this.addMenuItem(pSubMenu, {
                    onClick: function (args) {
                        context.filter.clear();
                        context.filter.setValue(context.id + "ClusterTargetSelect", context.menuFilterCluster.get("hpcc_value"));
                        context.refreshGrid();
                    }
                });
                pSubMenu.addChild(new MenuSeparator());
                this.menuFilterClearFilter = this.addMenuItem(pSubMenu, {
                    label: this.i18n.Clear,
                    onClick: function () {
                        context.filter.clear();
                        context.refreshGrid();
                    }
                });

                pMenu.addChild(new PopupMenuItem({
                    label: this.i18n.Filter,
                    popup: pSubMenu
                }));
            }
            pMenu.startup();
        },

        initWorkunitsGrid: function () {
            var context = this;
            this.listStore = new ESPLogicalFile.CreateLFQueryStore();
            this.treeStore = new ESPLogicalFile.CreateLFQueryTreeStore();
            this.workunitsGrid = new declare([ESPUtil.Grid(true, true)])({
                store: this.listStore,
                columns: {
                    col1: selector({
                        width: 27,
                        disabled: function (item) {
                            return item ? item.__hpcc_isDir : true;
                        },
                        selectorType: 'checkbox'
                    }),
                    IsCompressed: {
                        width: 25, sortable: false,
                        renderHeaderCell: function (node) {
                            node.innerHTML = dojoConfig.getImageHTML("compressed.png", context.i18n.Compressed);
                        },
                        formatter: function (compressed) {
                            if (compressed == true) {
                                return dojoConfig.getImageHTML("compressed.png");
                            }
                            return "";
                        }
                    },
                    IsKeyFile: {
                        width: 25, sortable: false,
                        renderHeaderCell: function (node) {
                            node.innerHTML = dojoConfig.getImageHTML("index.png", context.i18n.Index);
                        },
                        formatter: function (keyfile, row) {
                            if (row.ContentType === "key") {
                                return dojoConfig.getImageHTML("index.png");
                            }
                            return "";
                        }
                    },
                    __hpcc_displayName: tree({
                        label: this.i18n.LogicalName,
                        formatter: function (name, row) {
                            if (row.__hpcc_isDir) {
                                return name;
                            }
                            return (row.getStateImageHTML ? row.getStateImageHTML() + "&nbsp;" : "") + "<a href='#' rowIndex=" + row + " class='" + context.id + "LogicalNameClick'>" + name + "</a>";
                        },
                        renderExpando: function (level, hasChildren, expanded, object) {
                            var dir = this.grid.isRTL ? "right" : "left";
                            var cls = ".dgrid-expando-icon";
                            if (hasChildren) {
                                cls += ".ui-icon.ui-icon-triangle-1-" + (expanded ? "se" : "e");
                            }
                            var node = put("div" + cls + "[style=margin-" + dir + ": " + (level * (this.indentWidth || 9)) + "px; float: " + dir + (!object.__hpcc_isDir && level === 0 ? ";display: none" : "") + "]");
                            node.innerHTML = "&nbsp;";
                            return node;
                        }
                    }),
                    Owner: { label: this.i18n.Owner, width: 72 },
                    Description: { label: this.i18n.Description, width: 153 },
                    NodeGroup: { label: this.i18n.Cluster, width: 108 },
                    RecordCount: { label: this.i18n.Records, width: 72},
                    Totalsize: { label: this.i18n.Size, width: 72},
                    Parts: { label: this.i18n.Parts, width: 45},
                    Modified: { label: this.i18n.ModifiedUTCGMT, width: 155}
                }
            }, this.id + "WorkunitsGrid");

            var context = this;
            on(document, "." + context.id + "LogicalNameClick:click", function (evt) {
                if (context._onRowDblClick) {
                    var item = context.workunitsGrid.row(evt).data;
                    context._onRowDblClick(item);
                }
            });
            this.workunitsGrid.on(".dgrid-row:dblclick", function (evt) {
                if (context._onRowDblClick) {
                    var item = context.workunitsGrid.row(evt).data;
                    context._onRowDblClick(item);
                }
            });
            this.workunitsGrid.on(".dgrid-row:contextmenu", function (evt) {
                if (context._onRowContextMenu) {
                    var item = context.workunitsGrid.row(evt).data;
                    var cell = context.workunitsGrid.cell(evt);
                    var colField = cell.column.field;
                    var mystring = "item." + colField;
                    context._onRowContextMenu(item, colField, mystring);
                }
            });
            this.workunitsGrid.onSelectionChanged(function (event) {
                context.refreshActionState();
            });
            this.workunitsGrid.startup();

            this.copyGrid.createGrid({
                idProperty: "Name",
                columns: {
                    targetCopyName: editor({
                        label: this.i18n.TargetName,
                        width: 144,
                        autoSave: true,
                        editor: "text"
                    })
                }
            });

            this.renameGrid.createGrid({
                idProperty: "Name",
                columns: {
                    targetRenameName: editor({
                        label: this.i18n.TargetName,
                        width: 144,
                        autoSave: true,
                        editor: "text"
                    })
                }
            });

            this.addToSuperfileGrid.createGrid({
                idProperty: "Name",
                columns: {
                    Name: {
                        label: this.i18n.LogicalName
                    }
                }
            });

            this.desprayGrid.createGrid({
                idProperty: "Name",
                columns: {
                    Name: {
                        label: this.i18n.LogicalName
                    },
                    targetName: editor({
                        label: this.i18n.TargetName,
                        width: 144,
                        autoSave: true,
                        editor: "text"
                    })
                }
            });
        },

        initFilter: function () {
            this.validateDialog = new Dialog({
                title: this.i18n.Filter,
                content: this.i18n.NoFilterCriteriaSpecified
            });
        },

        refreshGrid: function (clearSelection) {
            this.workunitsGrid.set("store", this.treeMode ? this.treeStore : this.listStore, this.getFilter());
            if (clearSelection) {
                this.workunitsGrid.clearSelection();
            }
        },

        refreshActionState: function () {
            var selection = this.workunitsGrid.getSelected();
            var hasSelection = false;
            for (var i = 0; i < selection.length; ++i) {
                hasSelection = true;
            }

            registry.byId(this.id + "Open").set("disabled", !hasSelection);
            registry.byId(this.id + "Delete").set("disabled", !hasSelection);
            registry.byId(this.id + "CopyDropDown").set("disabled", !hasSelection);
            registry.byId(this.id + "RenameDropDown").set("disabled", !hasSelection);
            registry.byId(this.id + "AddtoDropDown").set("disabled", !hasSelection);
            registry.byId(this.id + "AddtoDropDown").set("disabled", !hasSelection);
            registry.byId(this.id + "DesprayDropDown").set("disabled", !hasSelection);
            registry.byId(this.id + "FilterFilterDropDown").set("disabled", this.treeMode);

            if (hasSelection) {
                var context = this;
                var data = [];
                var matchedPrefix = [];
                var filenames = {};
                arrayUtil.forEach(selection, function (item, idx) {
                    if (item.Name) {
                        var nameParts = item.Name.split("::");
                        if (nameParts.length) {
                            var filename = nameParts[nameParts.length - 1];
                            filenames[filename] = true;
                        }
                        if (idx === 0) {
                            matchedPrefix = nameParts.slice(0, nameParts.length - 1);
                        } else {
                            var i = 0;
                            for (var i = 0; i < matchedPrefix.length && i < nameParts.length - 1; ++i) {
                                if (matchedPrefix[i] !== nameParts[i]) {
                                    break;
                                }
                            }
                            matchedPrefix = matchedPrefix.slice(0, i);
                        }
                        lang.mixin(item, {
                            targetName: nameParts[nameParts.length - 1],
                            targetCopyName: item.Name + "_copy",
                            targetRenameName: item.Name + "_rename"
                        });
                        data.push(item);
                    }
                });
                var superfileName = "superfile";
                var i = 1;
                while (filenames[superfileName]) {
                    superfileName = "superfile_" + i++;
                }
                registry.byId(this.id + "AddToSuperfileTargetName").set("value", matchedPrefix.join("::") + "::" + superfileName);
                this.copyGrid.setData(data);
                this.renameGrid.setData(data);
                this.addToSuperfileGrid.setData(data);
                this.desprayGrid.setData(data);
            }
        },

        ensureDFUWUPane: function (id, params) {
            id = this.createChildTabID(id);
            var retVal = registry.byId(id);
            if (!retVal) {
                var context = this;
                retVal = new DelayLoadWidget({
                    id: id,
                    title: params.Wuid,
                    closable: true,
                    delayWidget: "DFUWUDetailsWidget",
                    _hpccParams: params
                });
                this.addChild(retVal, 1);
            }
            return retVal;
        },

        ensureLFPane: function (id, params) {
            id = this.createChildTabID(id);
            var retVal = registry.byId(id);
            if (!retVal) {
                if (params.isSuperfile) {
                    retVal = new DelayLoadWidget({
                        id: id,
                        title: params.Name,
                        closable: true,
                        delayWidget: "SFDetailsWidget",
                        _hpccParams: params
                    });
                } else {
                    retVal = new DelayLoadWidget({
                        id: id,
                        title: params.Name,
                        closable: true,
                        delayWidget: "LFDetailsWidget",
                        _hpccParams: {
                            NodeGroup: params.NodeGroup,
                            Name: params.Name
                        }
                    });
                }
                this.addChild(retVal, 1);
            }
            return retVal;
        }

    });
});
