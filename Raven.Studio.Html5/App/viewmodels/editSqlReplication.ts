﻿import router = require("plugins/router");
import viewModelBase = require("viewmodels/viewModelBase");
import appUrl = require("common/appUrl");
import dialog = require("plugins/dialog");
import aceEditorBindingHandler = require("common/aceEditorBindingHandler");
import alertType = require("common/alertType");
import alertArgs = require("common/alertArgs");
import app = require("durandal/app");
import database = require("models/database");
import collection = require("models/collection");
import sqlReplication = require("models/sqlReplication");
import getSqlReplicationsCommand = require("commands/getSqlReplicationsCommand");
import saveSqlReplicationsCommand = require("commands/saveSqlReplicationsCommand");
import getCollectionsCommand = require("commands/getCollectionsCommand");
import ace = require("ace/ace");
import sqlReplicationStatsDialog = require("viewmodels/sqlReplicationStatsDialog");
import document = require("models/document");
import saveDocumentCommand = require("commands/saveDocumentCommand");
import deleteDocuments = require("viewmodels/deleteDocuments");
import getDocumentWithMetadataCommand = require("commands/getDocumentWithMetadataCommand");
import getDocumentsMetadataByIDPrefixCommand = require("commands/getDocumentsMetadataByIDPrefixCommand");
import documentMetadata = require("models/documentMetadata");
import resetSqlReplicationCommand = require("commands/resetSqlReplicationCommand");


class editSqlReplication extends viewModelBase {

    static editSqlReplicationSelector = "#editSQLReplication";

    editedReplication = ko.observable<sqlReplication>();
    collections = ko.observableArray<string>();
    areAllSqlReplicationsValid: KnockoutComputed<boolean>;
    isSaveEnabled: KnockoutComputed<boolean>;
    loadedSqlReplications: string[] = [];
    sqlReplicationName: KnockoutComputed<string>;
    isEditingNewReplication = ko.observable(false);
    
    
    appUrls: computedAppUrls;

    isBusy = ko.observable(false);
    initialReplicationId:string='';

    constructor() {
        super();

        aceEditorBindingHandler.install();
        this.appUrls = appUrl.forCurrentDatabase();
        this.sqlReplicationName = ko.computed(() => (!!this.editedReplication() && !this.isEditingNewReplication()) ? this.editedReplication().name() : null);
    }

    private addScriptLabelPopover() {
        var popOverSettings: PopoverOptions = {
            html: true,
            trigger: 'hover',
            content: 'Replication scripts use JScript.<br/><br/>The script will be called once for each document in the source document collection, with <span class="code-keyword">this</span> representing the document, and the document id available as <i>documentId</i>.<br/><br/>Call <i>replicateToTableName</i> for each row you want to write to the database.<br/><br/>Example:</br><pre><span class="code-keyword">var</span> orderData = {<br/>   Id: documentId,<br/>   OrderLinesCount: <span class="code-keyword">this</span>.OrderLines.length,<br/>   TotalCost: 0<br/>};<br/><br/>replicateToOrders(\'Id\', orderData);<br/><br/>for (<span class="code-keyword">var</span> i = 0; i &lt; <span class="code-keyword">this</span>.OrderLines.length; i++) {<br/>   <span class="code-keyword">var</span> line = <span class="code-keyword">this</span>.OrderLines[i];<br/>   orderData.TotalCost += line.Cost;<br/>   replicateToOrderLines(\'OrderId\', {"<br/>      OrderId: documentId,<br/>      Qty: line.Quantity,<br/>      Product: line.Product,<br/>      Cost: line.Cost<br/>   });<br/>}</pre>',
            selector: '.script-label',
            placement:"right"
        };
        $('body').popover(popOverSettings);
        $('form :input[name="ravenEntityName"]').on("keypress", (e) => {
            return e.which != 13;
        });
    }

    canActivate(replicationToEditName: string) {
        if (replicationToEditName) {
            var canActivateResult = $.Deferred();
            this.loadSqlReplication(replicationToEditName)
                .done(() => canActivateResult.resolve({ can: true }))
                .fail(() => {
                    ko.postbox.publish("Alert", new alertArgs(alertType.danger, "Could not find " + decodeURIComponent(replicationToEditName) + " replication", null));
                    canActivateResult.resolve({ redirect: appUrl.forSqlReplications(this.activeDatabase()) });
                });

            return canActivateResult;
        } else {
            this.isEditingNewReplication(true);
            this.editedReplication(this.createSqlReplication());
            return $.Deferred().resolve({ can: true });
        }
    }

    activate(replicationToEditName: string) {
        super.activate(replicationToEditName);
        viewModelBase.dirtyFlag = new ko.DirtyFlag([this.editedReplication]);
        this.isSaveEnabled = ko.computed(() => {
            return viewModelBase.dirtyFlag().isDirty();
        });
    }
    
   
    loadSqlReplication(replicationToLoadName: string) {
        var loadDeferred = $.Deferred();
        $.when(this.fetchSqlReplicationToEdit(replicationToLoadName), this.fetchCollections(this.activeDatabase()))
            .done(() => {
                this.editedReplication().collections = this.collections;
                new getDocumentsMetadataByIDPrefixCommand("Raven/SqlReplication/Configuration/", 256, this.activeDatabase())
                    .execute()
                    .done((results: string[]) => {
                        this.loadedSqlReplications = results;
                        loadDeferred.resolve();
                    }).
                    fail(() => loadDeferred.reject());
            })
            .fail(() => {
            loadDeferred.reject();
        });

        return loadDeferred;
    }

    fetchSqlReplicationToEdit(sqlReplicationName: string): JQueryPromise<any> {
        var loadDocTask = new getDocumentWithMetadataCommand("Raven/SqlReplication/Configuration/" + sqlReplicationName, this.activeDatabase()).execute();
        loadDocTask.done((document: document) => {
            var sqlReplicationDto: any = document.toDto(true);
            this.editedReplication(new sqlReplication(sqlReplicationDto));
            this.initialReplicationId = this.editedReplication().name();
            viewModelBase.dirtyFlag().reset(); //Resync Changes
        });
        loadDocTask.always(() => this.isBusy(false));
        this.isBusy(true);
        return loadDocTask;
    }

    private fetchCollections(db: database): JQueryPromise<any> {
        return new getCollectionsCommand(db)
            .execute()
            .done((collections: Array<collection>) => {
                this.collections(collections.map((collection: collection) => { return collection.name; }));
            });
    }

    showStats() {
        var viewModel = new sqlReplicationStatsDialog(this.activeDatabase(), this.editedReplication().name());
        app.showDialog(viewModel);
    }

    refreshSqlReplication() {
        if (this.isEditingNewReplication() === false) {
            var docId = this.initialReplicationId;

            this.loadSqlReplication(docId);
        } else {
            this.editedReplication(this.createSqlReplication());
        }
    }

    compositionComplete() {
        super.compositionComplete();
        this.addScriptLabelPopover();
        $('pre').each((index, currentPreElement) => {
            this.initializeAceValidity(currentPreElement);
        });
    }
    
    createSqlReplication(): sqlReplication {
        var newSqlReplication: sqlReplication = sqlReplication.empty();
        newSqlReplication.collections = this.collections;
        this.subscribeToSqlReplicationName(newSqlReplication);
        return newSqlReplication;
    }


    private subscribeToSqlReplicationName(sqlReplicationElement: sqlReplication) {
        sqlReplicationElement.name.subscribe((previousName) => {
            //Get the previous value of 'name' here before it's set to newValue
            var nameInputArray = $('input[name="name"]').filter(function () { return this.value === previousName; });
            if (nameInputArray.length === 1) {
                var inputField: any = nameInputArray[0];
                inputField.setCustomValidity("");
            }
        }, this, "beforeChange");
        sqlReplicationElement.name.subscribe((newName) => {
            var message = "";
            if (newName === "") {
                message = "Please fill out this field.";
            }
            else if (this.isSqlReplicationNameExists(newName)) {
                message = "SQL Replication name already exists.";
            }
            $('input[name="name"]')
                .filter(function () { return this.value === newName; })
                .each((index, element: any) => {
                    element.setCustomValidity(message);
                });
        });
    }

    private isSqlReplicationNameExists(name): boolean {
        var count = 0;
        return !!this.loadedSqlReplications.first(x=>x==name);
    }

    private initializeAceValidity(element: Element) {
        var editor: AceAjax.Editor = ko.utils.domData.get(element, "aceEditor");
        if (editor)
        {
        var editorValue = editor.getSession().getValue();
        if (editorValue === "") {
            var textarea: any = $(element).find('textarea')[0];
            textarea.setCustomValidity("Please fill out this field.");
        }
        }
    }

    save() {
        var currentDocumentId = this.editedReplication().name();

        if (this.initialReplicationId !== currentDocumentId) {
            delete this.editedReplication().__metadata.etag;
            delete this.editedReplication().__metadata.lastModified;
        }
        
        var newDoc = new document(this.editedReplication().toDto());
        newDoc.__metadata = new documentMetadata();
        this.attachReservedMetaProperties("Raven/SqlReplication/Configuration/" + currentDocumentId, newDoc.__metadata);
        
        var saveCommand = new saveDocumentCommand("Raven/SqlReplication/Configuration/" + currentDocumentId, newDoc, this.activeDatabase());
        var saveTask = saveCommand.execute();
        saveTask.done((idAndEtag: { Key: string; ETag: string }) => {
            viewModelBase.dirtyFlag().reset(); //Resync Changes
            this.loadSqlReplication(idAndEtag.Key);
            this.updateUrl(idAndEtag.Key);
            this.isEditingNewReplication(false);
            this.updateUrl(currentDocumentId);
            this.initialReplicationId = currentDocumentId;
        });
    }


    updateUrl(docId: string) {
        var url = appUrl.forEditSqlReplication(docId, this.activeDatabase());
        router.navigate(url, false);
    }

    attachReservedMetaProperties(id: string, target: documentMetadata) {
        target.etag = '';
        target.ravenEntityName = !target.ravenEntityName ? document.getEntityNameFromId(id) : target.ravenEntityName;
        target.id = id;
    }
    
    deleteSqlReplication() {
        var newDoc = new document(this.editedReplication().toDto());
        
        if (newDoc) {
            var viewModel = new deleteDocuments([newDoc]);
            viewModel.deletionTask.done(() => {
                viewModelBase.dirtyFlag().reset(); //Resync Changes
                router.navigate(appUrl.forCurrentDatabase().sqlReplications());
            });
            app.showDialog(viewModel, editSqlReplication.editSqlReplicationSelector);
            
        } 
    }
    resetSqlReplication() {
        var replicationId = this.initialReplicationId;
        new resetSqlReplicationCommand(this.activeDatabase(), replicationId).execute()
            .done(() => {
                ko.postbox.publish("Alert", new alertArgs(alertType.success, "Replication " + replicationId + " was reset successfully", null));
            })
        .fail((foo) => {
            ko.postbox.publish("Alert", new alertArgs(alertType.danger, "Replication " + replicationId + " was failed to reset", null));
        });
    }



}

export = editSqlReplication; 