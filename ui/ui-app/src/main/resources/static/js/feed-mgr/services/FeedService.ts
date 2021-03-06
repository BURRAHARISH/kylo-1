import * as angular from "angular";
import * as _ from "underscore";
import {DomainType} from "./DomainTypesService";
import {Common} from "../../common/CommonTypes";

function FeedService($http: angular.IHttpService, $q: angular.IQService, $mdToast: angular.material.IToastService, $mdDialog: angular.material.IDialogService, RestUrlService: any,
                     VisualQueryService: any, FeedCreationErrorService: any, FeedPropertyService: any, AccessControlService: any, EntityAccessControlService: any, StateService: any) {

    function trim(str: string) {
        return str.replace(/^\s+|\s+$/g, "");
    }

    function toCamel(str: string) {
        return str.replace(/(\-[a-z])/g, function ($1) {
            return $1.toUpperCase().replace('-', '');
        });
    }

    function toDash(str: string) {
        return str.replace(/([A-Z])/g, function ($1) {
            return "-" + $1.toLowerCase();
        });
    }

    function spacesToUnderscore(str: string) {
        return str.replace(/\s+/g, '_');
    }

    function toUnderscore(str: string) {
        return str.replace(/(?:^|\.?)([A-Z])/g, function (x, y) {
            return "_" + y.toLowerCase()
        }).replace(/^_/, "")
        //return str.replace(/([A-Z])/g, "_$1").replace(/^_/,'').toLowerCase();
    }

    /**
     * A cache of the controllerservice Id to its display name.
     * This is used when a user views a feed that has a controller service as a property so it shows the Name (i.e. MySQL)
     * and not the UUID of the service.
     *
     * @type {{}}
     */
    let controllerServiceDisplayCache :Common.Map<string> = {};

    let controllerServiceDisplayCachePromiseTracker: any = {};

    const data = {

        /**
         * The Feed model in the Create Feed Stepper
         */
        createFeedModel: {},
        /**
         * The Feed Model that is being Edited when a user clicks on a Feed Details
         */
        editFeedModel: {},
        /**
         * Feed model for comparison with editFeedModel in Versions tab
         */
        versionFeedModel: {},
        /**
         * Difference between editFeedModel and versionFeedModel
         */
        versionFeedModelDiff: [],
        /**
         * The initial CRON expression used when a user selects Cron for the Schedule option
         */
        DEFAULT_CRON: "0 0 12 1/1 * ? *",

        /**
         * In the Data Processing section these are the available Strategies a user can choose when defining the feed
         */
        mergeStrategies: [
            {name: 'Sync', type: 'SYNC', hint: 'Replace table content', disabled: false},
            {name: 'Rolling sync', type: 'ROLLING_SYNC', hint: 'Replace content in matching partitions'},
            {name: 'Merge', type: 'MERGE', hint: 'Insert all rows', disabled: false},
            {name: 'Dedupe and merge', type: 'DEDUPE_AND_MERGE', hint: 'Insert rows ignoring duplicates', disabled: false},
            {name: 'Merge using primary key', type: 'PK_MERGE', hint: 'Upsert using primary key'}
        ],

        /**
         * The available Target Format options
         */
        targetFormatOptions: [{label: "ORC", value: 'STORED AS ORC'},
            {label: "PARQUET", value: 'STORED AS PARQUET'},
            {label: "AVRO", value: 'STORED AS AVRO'},
            {
                label: "TEXTFILE",
                value: 'ROW FORMAT SERDE \'org.apache.hadoop.hive.serde2.OpenCSVSerde\' WITH SERDEPROPERTIES ( \'separatorChar\' = \',\' ,\'escapeChar\' = \'\\\\\' ,\'quoteChar\' = \'"\')'
                + ' STORED AS'
                + ' TEXTFILE'
            },
            {label: "RCFILE", value: 'ROW FORMAT SERDE "org.apache.hadoop.hive.serde2.columnar.ColumnarSerDe" STORED AS RCFILE'}],
        /**
         * The available Compression options for a given targetFormat {@see this#targetFormatOptions}
         */
        compressionOptions: {"ORC": ['NONE', 'SNAPPY', 'ZLIB'], "PARQUET": ['NONE', 'SNAPPY'], "AVRO": ['NONE']},

        /**
         * Standard data types for column definitions
         */
        columnDefinitionDataTypes: ['string', 'int', 'bigint', 'tinyint', 'decimal', 'double', 'float', 'date', 'timestamp', 'boolean', 'binary'],

        /**
         * Returns an array of all the compression options regardless of the {@code targetFormat}
         * (i.e. ['NONE','SNAPPY','ZLIB']
         * @returns {Array}
         */
        allCompressionOptions: function () {
            let arr: any[] = [];
            _.each(this.compressionOptions, function (options: any) {
                arr = _.union(arr, options);
            });
            return arr;
        },
        /**
         * Returns the feed object model for creating a new feed
         *
         * @returns {{id: null, versionName: null, templateId: string, feedName: string, description: null, systemFeedName: string, inputProcessorType: string, inputProcessor: null,
         *     nonInputProcessors: Array, properties: Array, securityGroups: Array, schedule: {schedulingPeriod: string, schedulingStrategy: string, concurrentTasks: number}, defineTable: boolean,
         *     allowPreconditions: boolean, dataTransformationFeed: boolean, table: {tableSchema: {name: null, fields: Array}, sourceTableSchema: {name: null, fields: Array}, method: string,
         *     existingTableName: null, targetMergeStrategy: string, feedFormat: string, targetFormat: null, fieldPolicies: Array, partitions: Array, options: {compress: boolean, compressionFormat:
         *     null, auditLogging: boolean, encrypt: boolean, trackHistory: boolean}, sourceTableIncrementalDateField: null}, category: {id: null, name: null}, dataOwner: string, tags: Array,
         *     reusableFeed: boolean, dataTransformation: {chartViewModel: null, dataTransformScript: null, sql: null, states: Array}, userProperties: Array}}
         */
        getNewCreateFeedModel: function () {
            return {
                id: null,
                versionName: null,
                templateId: '',
                feedName: '',
                description: '',
                systemFeedName: '',
                inputProcessorType: '',
                inputProcessorName:null,
                inputProcessor: null,
                nonInputProcessors: [],
                properties: [],
                securityGroups: [],
                schedule: {schedulingPeriod: data.DEFAULT_CRON, schedulingStrategy: 'CRON_DRIVEN', concurrentTasks: 1},
                defineTable: false,
                allowPreconditions: false,
                dataTransformationFeed: false,
                table: {
                    tableSchema: {name: null, fields: []},
                    sourceTableSchema: {name: null, tableSchema: null, fields: []},
                    feedTableSchema: {name: null, fields: []},
                    method: 'SAMPLE_FILE',
                    existingTableName: null,
                    structured: false,
                    targetMergeStrategy: 'DEDUPE_AND_MERGE',
                    feedFormat: 'ROW FORMAT SERDE \'org.apache.hadoop.hive.serde2.OpenCSVSerde\''
                    + ' WITH SERDEPROPERTIES ( \'separatorChar\' = \',\' ,\'escapeChar\' = \'\\\\\' ,\'quoteChar\' = \'"\')'
                    + ' STORED AS TEXTFILE',
                    targetFormat: 'STORED AS ORC',
                    fieldPolicies: [],
                    partitions: [],
                    options: {compress: false, compressionFormat: 'NONE', auditLogging: true, encrypt: false, trackHistory: false},
                    sourceTableIncrementalDateField: null
                },
                category: {id: null, name: null},
                dataOwner: '',
                tags: [],
                reusableFeed: false,
                dataTransformation: {
                    chartViewModel: null,
                    datasourceIds: null,
                    datasources: null,
                    dataTransformScript: null,
                    sql: null,
                    states: []
                },
                userProperties: [],
                options: {skipHeader: false},
                active: true,
                roleMemberships: [],
                owner: null,
                roleMembershipsUpdated: false,
                tableOption: {},
                cloned: false,
                usedByFeeds: [],
                allowIndexing: true,
                historyReindexingStatus: 'NEVER_RUN',
                view: {
                    generalInfo: {disabled: false},
                    feedDetails: {disabled: false},
                    table: {disabled: false},
                    dataPolicies:{disabled: false},
                    properties: {
                        disabled: false,
                        dataOwner:{disabled:false},
                        tags:{disabled:false}
                    },
                    accessControl: {disabled: false},
                    schedule: {
                        disabled: false,
                        schedulingPeriod: {disabled: false},
                        schedulingStrategy: {disabled: false},
                        active: {disabled: false},
                        executionNode: {disabled: false},
                        preconditions: {disabled: false}
                    }
                }
            } as any;
        },
        cloneFeed: function () {
            //copy the feed
            data.createFeedModel = angular.copy(data.editFeedModel);
            data.createFeedModel.id = null;
            data.createFeedModel.cloned = true;
            data.createFeedModel.clonedFrom = data.createFeedModel.feedName;
            data.createFeedModel.feedName += "_copy";
            data.createFeedModel.systemFeedName += "_copy";
            data.createFeedModel.owner = undefined;
            _.each(data.createFeedModel.table.tableSchema.fields, function(field: any) {
                field._id = _.uniqueId();
            });
            _.each(data.createFeedModel.table.partitions, function(partition: any) {
                partition._id = _.uniqueId();
            });
            return data.createFeedModel;
        },
        /**
         * Called when starting a new feed.
         * This will return the default model and also reset the Query Builder and Error service
         */
        newCreateFeed: function () {
            this.createFeedModel = this.getNewCreateFeedModel();
            VisualQueryService.resetModel();
            FeedCreationErrorService.reset();
        },
        /**
         * Updates a Feed with another model.
         * The model that is passed in will update the currently model being edited ({@code this.editFeedModel})
         * @param feedModel
         */
        updateFeed: function (feedModel: any) {
            var self = this;
            this.editFeedModel.totalPreSteps = 0;
            this.editFeedModel.inputProcessorName = null;
            this.editFeedModel.usedByFeeds = [];
            this.editFeedModel.description = '';
            this.editFeedModel.inputProcessor = null;
            angular.extend(this.editFeedModel, feedModel);

            //set the field name to the policy name attribute
            if (this.editFeedModel.table != null && this.editFeedModel.table.fieldPolicies != null) {
                angular.forEach(this.editFeedModel.table.fieldPolicies, function (policy, i) {
                    var field = self.editFeedModel.table.tableSchema.fields[i];
                    if (field != null && field != undefined) {
                        policy.name = field.name;
                        policy.derivedDataType = field.derivedDataType;
                        policy.nullable = field.nullable;
                        policy.primaryKey = field.primaryKey;
                    }
                });
            }

            //add in the view states
            var defaultView = self.getNewCreateFeedModel().view;
            this.editFeedModel.view = defaultView;

        },
        /**
         * Shows the Feed Error Dialog
         * @returns {*}
         */
        showFeedErrorsDialog: function () {
            return FeedCreationErrorService.showErrorDialog();
        },
        /**
         * Adds a Nifi Exception error to the Feed Error dialog
         * @param name
         * @param nifiFeed
         */
        buildErrorData: function (name: any, response: any) {
            FeedCreationErrorService.buildErrorData(name, response);
        },
        /**
         * Check to see if there are any errors added to the Error Dialog
         * @returns {*}
         */
        hasFeedCreationErrors: function () {
            return FeedCreationErrorService.hasErrors();
        },

        /**
         * Resets the Create feed ({@code this.createFeedModel}) object
         */
        resetFeed: function () {
            //get the new model and its keys
            var newFeedObj = this.getNewCreateFeedModel();
            var keys = _.keys(newFeedObj)
            var createFeedModel = angular.extend(this.createFeedModel, newFeedObj);

            //get the create model and its keys
            var modelKeys = _.keys(this.createFeedModel);

            //find those that have been added and delete them
            var extraKeys = _.difference(modelKeys, keys);
            _.each(extraKeys, function (key) {
                delete createFeedModel[key];
            })


            VisualQueryService.resetModel();
            FeedCreationErrorService.reset();
        },

        getDataTypeDisplay: function (columnDef: any) {
            return columnDef.precisionScale != null ? columnDef.derivedDataType + "(" + columnDef.precisionScale + ")" : columnDef.derivedDataType;
        },

        /**
         * returns the Object used for creating the destination schema for each Field
         * This is used in the Table Step to define the schema
         *
         * @returns {{name: string, description: string, dataType: string, precisionScale: null, dataTypeDisplay: Function, primaryKey: boolean, nullable: boolean, createdTracker: boolean,
         *     updatedTracker: boolean, sampleValues: Array, selectedSampleValue: string, isValid: Function, _id: *}}
         */
        newTableFieldDefinition: function () {
            var newField: any = {
                name: '',
                description: '',
                derivedDataType: 'string',
                precisionScale: null,
                dataTypeDisplay: '',
                primaryKey: false,
                nullable: false,
                createdTracker: false,
                updatedTracker: false,
                sampleValues: [],
                selectedSampleValue: '',
                tags: [],
                validationErrors: {
                    name: {},
                    precision: {}
                },
                isValid: function () {
                    return this.name != '' && this.derivedDataType != '';
                },
                _id: _.uniqueId()
            };
            return newField;
        },
        /**
         * Returns the object used for creating Data Processing policies on a given field
         * This is used in the Data Processing step
         *
         * @param fieldName
         * @returns {{name: (*|string), partition: null, profile: boolean, standardization: null, validation: null}}
         */
        newTableFieldPolicy: function (fieldName: any): any {
            return {name: fieldName || '', partition: null, profile: true, standardization: null, validation: null};
        },
        /**
         * For a given list of incoming Table schema fields ({@see this#newTableFieldDefinition}) it will create a new FieldPolicy object ({@see this#newTableFieldPolicy} for it
         */
        setTableFields: function (fields: any[], policies: any[] = null) {
            this.createFeedModel.table.tableSchema.fields = fields;
            this.createFeedModel.table.fieldPolicies = (policies != null && policies.length > 0) ? policies : fields.map(field => this.newTableFieldPolicy(field.name));

            this.createFeedModel.schemaChanged = !this.validateSchemaDidNotChange(this.createFeedModel);
        },
        /**
         * Ensure that the Table Schema has a Field Policy for each of the fields and that their indices are matching.
         */
        syncTableFieldPolicyNames: function () {
            var self = this;
            angular.forEach(self.createFeedModel.table.tableSchema.fields, function (columnDef, index) {
                //update the the policy
                var inArray = index < self.createFeedModel.table.tableSchema.fields.length && index >= 0;
                if (inArray) {
                    var name = self.createFeedModel.table.tableSchema.fields[index].name;
                    if (name != undefined) {
                        self.createFeedModel.table.fieldPolicies[index].name = name;
                        //assign pointer to the field?
                        self.createFeedModel.table.fieldPolicies[index].field = columnDef;
                    }
                    else {
                        if (self.createFeedModel.table.fieldPolicies[index].field) {
                            self.createFeedModel.table.fieldPolicies[index].field == null;
                        }
                    }
                }
            });
            //remove any extra columns in the policies
            while (self.createFeedModel.table.fieldPolicies.length > self.createFeedModel.table.tableSchema.fields.length) {
                self.createFeedModel.table.fieldPolicies.splice(self.createFeedModel.table.tableSchema.fields.length, 1);
            }
        },
        /**
         * return true/false if there is a PK defined for the incoming set of {@code feedModel.table.tableSchema.fields
             * @param fields
             * @returns {boolean}
         */
        hasPrimaryKeyDefined: function (feedModel: any) {
            var firstPk = _.find(feedModel.table.tableSchema.fields, function (field: any) {
                return field.primaryKey
            });
            return firstPk != null && firstPk != undefined;
        },

        /**
         * enable/disable the PK Merge strategy enforcing a PK column set.
         * returns if the strategy is valid or not
         *
         * @param feedModel
         * @param strategies
         * @returns {boolean}
         */
        enableDisablePkMergeStrategy: function (feedModel: any, strategies: any) {
            var pkStrategy = _.find(strategies, function (strategy: any) {
                return strategy.type == 'PK_MERGE'
            });
            var selectedStrategy = feedModel.table.targetMergeStrategy;
            if (pkStrategy) {
                if (!this.hasPrimaryKeyDefined(feedModel)) {

                    pkStrategy.disabled = true;
                }
                else {
                    pkStrategy.disabled = false;
                }

            }
            if (pkStrategy && selectedStrategy == pkStrategy.type) {
                return !pkStrategy.disabled;
            }
            else {
                return true;
            }

        },

        /**
         * return true/false if there is a
         */
        enableDisableRollingSyncMergeStrategy: function (feedModel: any, strategies: any) {
            var rollingSyncStrategy = _.find(strategies, function (strategy: any) {
                return strategy.type == 'ROLLING_SYNC';
            });

            var selectedStrategy = feedModel.table.targetMergeStrategy;

            if (rollingSyncStrategy) {
                rollingSyncStrategy.disabled = !this.hasPartitions(feedModel);
            }

            if (rollingSyncStrategy && selectedStrategy == rollingSyncStrategy.type) {
                return !rollingSyncStrategy.disabled;
            } else {
                return true;
            }
        },

        updateEnabledMergeStrategy: function (feedModel: any, strategies: any) {
            this.enableDisablePkMergeStrategy(feedModel, strategies);
            this.enableDisableRollingSyncMergeStrategy(feedModel, strategies);
        },

        hasPartitions: function (feedModel: any) {
            return feedModel.table.partitions != null
                && feedModel.table.partitions != undefined
                && feedModel.table.partitions.length > 0;
        },

        /**
         * This will clear the Table Schema resetting the method, fields, and policies
         */
        clearTableData: function () {

            //this.createFeedModel.table.method = 'MANUAL';
            this.createFeedModel.table.tableSchema.fields = [];
            this.createFeedModel.table.fieldPolicies = [];
            this.createFeedModel.table.existingTableName = null;
        },
        /**
         * In the stepper when a feeds step is complete and validated it will change the Step # icon to a Check circle
         */
        updateEditModelStateIcon: function () {
            if (this.editFeedModel.state == 'ENABLED') {
                this.editFeedModel.stateIcon = 'check_circle'
            }
            else {
                this.editFeedModel.stateIcon = 'block'
            }
        },
        /**
         * Initialize this object by creating a new empty {@see this#createFeedModel} object
         */
        init: function () {
            this.newCreateFeed();
        },
        /**
         * Before the model is saved to the server this will be called to make any changes
         * @see this#saveFeedModel
         * @param model
         */
        prepareModelForSave: function (model: any) {
            var properties: any[] = [];

            if (model.inputProcessor != null) {
                angular.forEach(model.inputProcessor.properties, function (property) {
                    FeedPropertyService.initSensitivePropertyForSaving(property)
                    properties.push(property);
                });
            }

            angular.forEach(model.nonInputProcessors, function (processor) {
                angular.forEach(processor.properties, function (property) {
                    FeedPropertyService.initSensitivePropertyForSaving(property)
                    properties.push(property);
                });
            });
            if(model.inputProcessor) {
                model.inputProcessorName = model.inputProcessor.name;
            }
            model.properties = properties;

            //prepare access control changes if any
            EntityAccessControlService.updateRoleMembershipsForSave(model.roleMemberships);

            if(model.cloned){
                model.state = null;
            }
            //remove the self.model.originalTableSchema if its there
            delete model.originalTableSchema;


            if (model.table && model.table.fieldPolicies && model.table.tableSchema && model.table.tableSchema.fields) {
                // Set feed

                var newFields: any[] = [];
                var newPolicies: any[] = [];
                var feedFields: any[] = [];
                var sourceFields: any[] = [];
                angular.forEach(model.table.tableSchema.fields, function (columnDef, idx) {
                    var policy = model.table.fieldPolicies[idx];
                    var sourceField = angular.copy(columnDef);
                    var feedField = angular.copy(columnDef);

                    sourceField.name = columnDef.origName;
                    sourceField.derivedDataType = columnDef.origDataType;
                    // structured files must use the original names
                    if (model.table.structured == true) {
                        feedField.name = columnDef.origName;
                        feedField.derivedDataType = columnDef.origDataType;
                    } else if (model.table.method == 'EXISTING_TABLE') {
                        sourceField.name = columnDef.origName;
                    }
                    if (angular.isDefined(policy)) {
                        policy.feedFieldName = feedField.name;
                        policy.name = columnDef.name;
                    }

                    if (!columnDef.deleted) {
                        newFields.push(columnDef);
                        if (angular.isDefined(policy)) {
                            newPolicies.push(policy);
                        }
                        sourceFields.push(sourceField);
                        feedFields.push(feedField);

                    } else {
                        // For files the feed table must contain all the columns from the source even if unused in the target
                        if (model.table.method == 'SAMPLE_FILE') {
                            feedFields.push(feedField);
                        } else if (model.table.method == 'EXISTING_TABLE' && model.table.sourceTableIncrementalDateField == sourceField.name) {
                            feedFields.push(feedField);
                            sourceFields.push(sourceField);
                        }
                    }
                });
                model.table.fieldPolicies = newPolicies;
                model.table.tableSchema.fields = newFields;

                if (model.table.sourceTableSchema == undefined) {
                    model.table.sourceTableSchema = {name: null, tableSchema: null, fields: []};
                }
                //only set the sourceFields if its the first time creating this feed
                if (model.id == null) {
                    model.table.sourceTableSchema.fields = sourceFields;
                    model.table.feedTableSchema.fields = feedFields;
                }
                if (model.table.feedTableSchema == undefined) {
                    model.table.feedTableSchema = {name: null, fields: []};
                }


                //remove any extra columns in the policies
                /*
                 while(model.table.fieldPolicies.length > model.table.tableSchema.fields.length) {
                 model.table.fieldPolicies.splice(model.table.tableSchema.fields.length, 1);
                 }
                 */
            }
        },
        /**
         * Show a dialog indicating that the feed is saving
         * @param ev
         * @param message
         * @param feedName
         */
        showFeedSavingDialog: function (ev: any, message: any, feedName: any) {
            $mdDialog.show({
                controller: 'FeedSavingDialogController',
                templateUrl: 'js/feed-mgr/feeds/edit-feed/details/feed-saving-dialog.html',
                parent: angular.element(document.body),
                targetEvent: ev,
                clickOutsideToClose: false,
                fullscreen: true,
                locals: {
                    message: message,
                    feedName: feedName
                }
            })
                .then(function (answer) {
                    //do something with result
                }, function () {
                    //cancelled the dialog
                });
        },
        /**
         * Hide the Feed Saving Dialog
         */
        hideFeedSavingDialog: function () {
            $mdDialog.hide();
        },

        validateSchemaDidNotChange:function(model:any){
            var valid = true;
            //if we are editing we need to make sure we dont modify the originalTableSchema
            if(model.id && model.originalTableSchema && model.table && model.table.tableSchema) {
                //if model.originalTableSchema != model.table.tableSchema  ... ERROR
                //mark as invalid if they dont match
                var origFields = _.chain(model.originalTableSchema.fields).sortBy('name').map(function (i) {
                    return i.name + " " + i.derivedDataType;
                }).value().join()
                var updatedFields = _.chain(model.table.tableSchema.fields).sortBy('name').map(function (i) {
                    return i.name + " " + i.derivedDataType;
                }).value().join()
                valid = origFields == updatedFields;
            }
            return valid
        },
        /**
         * Save the model Posting the data to the server
         * @param model
         * @returns {*}
         */
        saveFeedModel: function (model: any) {
            var self = this;
            self.prepareModelForSave(model);

            var deferred = $q.defer();
            var successFn = function (response: any) {
                var invalidCount = 0;

                if (response.data && response.data.success) {

                    //update the feed versionId and internal id upon save
                    model.id = response.data.feedMetadata.id;
                    model.versionName = response.data.feedMetadata.versionName;


                    $mdToast.show(
                        $mdToast.simple()
                            .textContent('Feed successfully saved')
                            .hideDelay(3000)
                    );
                    deferred.resolve(response);
                }
                else {
                    deferred.reject(response);
                }

            }
            var errorFn = function (err: any) {
                deferred.reject(err);
            }
            var copy = angular.copy(model);
            if (copy.registeredTemplate) {
                copy.registeredTemplate = undefined;
            }
            //reset the sensitive properties
            FeedPropertyService.initSensitivePropertiesForEditing(model.properties);

            var promise = $http({
                url: RestUrlService.CREATE_FEED_FROM_TEMPLATE_URL,
                method: "POST",
                data: angular.toJson(copy),
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8'
                }
            }).then(successFn, errorFn);

            return deferred.promise;
        },
        /**
         * Call out to the server to get the System Name for a passed in name
         * @param feedName
         * @returns {HttpPromise}
         */
        getSystemName: function (feedName: any) {

            return $http.get(RestUrlService.GET_SYSTEM_NAME, {params: {name: feedName}});

        },
        /**
         * Call out to the server to get info on whether feed history data reindexing is configured in Kylo
         * @returns {HttpPromise}
         */
        isKyloConfiguredForFeedHistoryDataReindexing: function() {
            return $http.get(RestUrlService.FEED_HISTORY_CONFIGURED);
        }
        ,
        /**
         * When creating a Feed find the First Column/Field that matches the given name
         * @param name
         * @returns {*|{}}
         */
        getColumnDefinitionByName: function (name: any) {
            return _.find(this.createFeedModel.table.tableSchema.fields, function (columnDef: any) {
                return columnDef.name == name;
            });
        },
        /**
         * Call the server to return a list of Feed Names
         * @returns {HttpPromise}
         */
        getFeedSummary: function () {

            var successFn = function (response: any) {
                return response.data;
            }
            var errorFn = function (err: any) {

            }
            var promise = $http.get(RestUrlService.GET_FEED_NAMES_URL);
            promise.then(successFn, errorFn);
            return promise;
        },
        /**
         * Call the server to return a list of Feed Names
         * @returns {HttpPromise}
         */
        getFeedNames: function () {

            var successFn = function (response: any) {
                return response.data;
            }
            var errorFn = function (err: any) {

            }
            var promise = $http.get(RestUrlService.OPS_MANAGER_FEED_NAMES);
            promise.then(successFn, errorFn);
            return promise;
        },
        /**
         * Call the server to get a list of all the available Preconditions that can be used when saving/scheduling the feed
         * @returns {HttpPromise}
         */
        getPossibleFeedPreconditions: function () {

            var successFn = function (response: any) {
                return response.data;
            }
            var errorFn = function (err: any) {
                console.log('ERROR ', err)
            }
            var promise = $http.get(RestUrlService.GET_POSSIBLE_FEED_PRECONDITIONS_URL);
            promise.then(successFn, errorFn);
            return promise;

        },

        /**
         * Gets the list of user properties for the specified feed.
         *
         * @param {Object} model the feed model
         * @return {Array.<{key: string, value: string}>} the list of user properties
         */
        getUserPropertyList: function (model: any): {key: string, value: string}[] {
            var userPropertyList: any[] = [];
            angular.forEach(model.userProperties, function (value, key: string) {
                if (!key.startsWith("jcr:")) {
                    userPropertyList.push({key: key, value: value});
                }
            });
            return userPropertyList;
        },

        /**
         * Gets the user fields for a new feed.
         *
         * @param {string} categoryId the category id
         * @returns {Promise} for the user fields
         */
        getUserFields: function (categoryId: string): angular.IPromise<any> {
            return $http.get(RestUrlService.GET_FEED_USER_FIELDS_URL(categoryId))
                .then(function (response) {
                    return response.data;
                });
        },

        /**
         * Gets the controller services of the specified type.
         *
         * @param {string} type a type class
         * @returns {Array}
         */
        getAvailableControllerServices: function (type: string): angular.IPromise<any> {
            return $http.get(RestUrlService.LIST_SERVICES_URL("root"), {params: {type: type}})
                .then(function (response) {
                    return response.data;
                });
        },
        setControllerServicePropertyDisplayName:function(property: any){

            let setDisplayValue = (property :any) : boolean => {
                let cacheEntry:string = controllerServiceDisplayCache[property.value];
                if(cacheEntry != null) {
                    property.displayValue =cacheEntry;
                    return true;
                }
                return false;
            }

            if(angular.isObject(property.propertyDescriptor) && angular.isString(property.propertyDescriptor.identifiesControllerService)) {
                if (!setDisplayValue(property)) {

                    let entry: any = controllerServiceDisplayCachePromiseTracker[property.propertyDescriptor.identifiesControllerService];
                    if (entry == undefined) {
                        let promise = data.getAvailableControllerServices(property.propertyDescriptor.identifiesControllerService);
                        entry = {request: promise, waitingProperties: []};
                        entry.waitingProperties.push(property);
                        controllerServiceDisplayCachePromiseTracker[property.propertyDescriptor.identifiesControllerService] = entry;
                        promise.then((services: any) => {
                            _.each(services, (service: any) => {
                                controllerServiceDisplayCache[service.id] = service.name;
                            });
                            _.each(entry.waitingProperties, (property) => {
                                setDisplayValue(property);
                            });
                            delete controllerServiceDisplayCachePromiseTracker[property.propertyDescriptor.identifiesControllerService];
                        })
                    }
                    else {
                        entry.waitingProperties.push(property);
                    }
                }
            }
        },
        /**
         * Finds the allowed controller services for the specified property and sets the allowable values.
         *
         * @param {Object} property the property to be updated
         */
        findControllerServicesForProperty: function (property: any) {
            // Show progress indicator
            property.isLoading = true;

            // Fetch the list of controller services
            data.getAvailableControllerServices(property.propertyDescriptor.identifiesControllerService)
                .then(function (services: any) {
                    // Update the allowable values
                    property.isLoading = false;
                    property.propertyDescriptor.allowableValues = _.map(services, function (service: any) {
                        return {displayName: service.name, value: service.id}
                    });
                }, function () {
                    // Hide progress indicator
                    property.isLoading = false;
                });
        },

        getFeedByName: function (feedName: string) {
            var deferred = $q.defer();
            $http.get(RestUrlService.FEED_DETAILS_BY_NAME_URL(feedName))
                .then(function (response) {
                    var feedResponse = response.data;
                    return deferred.resolve(feedResponse);
                });
            return deferred.promise;
        },

        /**
         * Gets the list of available Hive partition functions.
         *
         * @returns {Array.<string>} list of function names
         */
        getPartitionFunctions: function () {
            return $http.get(RestUrlService.PARTITION_FUNCTIONS_URL)
                .then(function (response) {
                    return response.data;
                });
        },
        
        
        getFeedVersions: function (feedId: string) {
            var successFn = function (response: any) {
                return response.data;
            }
            var errorFn = function (err: any) {
                console.log('ERROR ', err)
            }
            return $http.get(RestUrlService.FEED_VERSIONS_URL(feedId)).then(successFn, errorFn);
        },
        
        getFeedVersion: function (feedId: string, versionId: string) {
            var successFn = function (response: any) {
                return response.data;
            }
            var errorFn = function (err: any) {
                console.log('ERROR ', err)
            }
            return $http.get(RestUrlService.FEED_VERSION_ID_URL(feedId, versionId)).then(successFn, errorFn);
        },
        
        diffFeedVersions: function (feedId: string, versionId1: string, versionId2: string) {
            var successFn = function (response: any) {
                return response.data;

            }
            var errorFn = function (err: any) {
                console.log('ERROR ', err)
            }
            return $http.get(RestUrlService.FEED_VERSIONS_DIFF_URL(feedId, versionId1, versionId2)).then(successFn, errorFn);
        },

        /**
         * check if the user has access on an entity
         * @param permissionsToCheck an Array or a single string of a permission/action to check against this entity and current user
         * @param entity the entity to check. if its undefined it will use the current feed in the model
         * @returns {*} a promise, or a true/false.  be sure to wrap this with a $q().when()
         */
        hasEntityAccess: function (permissionsToCheck: any, entity: any) {
            if (entity == undefined) {
                entity = data.model;
            }
            return AccessControlService.hasEntityAccess(permissionsToCheck, entity, EntityAccessControlService.entityRoleTypes.FEED);
        },

        /**
         * Applies the specified domain type to the specified field.
         *
         * @param {Field} field the field to be updated
         * @param {FieldPolicy} policy the field policy to be updated
         * @param {DomainType} domainType the domain type be be applies
         */
        setDomainTypeForField: function (field: any, policy: any, domainType: DomainType) {
            policy.$currentDomainType = domainType;
            policy.domainTypeId = domainType.id;

            if (angular.isObject(domainType.field)) {
                field.tags = angular.copy(domainType.field.tags);
                if (angular.isString(domainType.field.name) && domainType.field.name.length > 0) {
                    field.name = domainType.field.name;
                }
                if (angular.isString(domainType.field.derivedDataType) && domainType.field.derivedDataType.length > 0) {
                    field.derivedDataType = domainType.field.derivedDataType;
                    field.precisionScale = domainType.field.precisionScale;
                    field.dataTypeDisplay = data.getDataTypeDisplay(field);
                }
            }

            if (angular.isObject(domainType.fieldPolicy)) {
                policy.standardization = angular.copy(domainType.fieldPolicy.standardization);
                policy.validation = angular.copy(domainType.fieldPolicy.validation);
            }
        },
        /**
         * Returns operation of the difference at given path for versioned feed
         * @param path current diff model
         * @returns {string} operation type, e.g. add, remove, update, no-change
         */
        diffOperation: function (path: any) {
            return this.versionFeedModelDiff && this.versionFeedModelDiff[path] ? this.versionFeedModelDiff[path].op : 'no-change';
        },

        diffCollectionOperation: function (path: any) {
            const self = this;
            if (this.versionFeedModelDiff) {
                if (this.versionFeedModelDiff[path]) {
                    return this.versionFeedModelDiff[path].op;
                } else {
                    const patch = {op: 'no-change'};
                    _.each(_.values(this.versionFeedModelDiff), function(p) {
                        if (p.path.startsWith(path + "/")) {
                            patch.op = self.joinVersionOperations(patch.op, p.op);
                        }
                    });
                    return patch.op;
                }
            }
            return 'no-change';
        },

        joinVersionOperations: function(op1: any, op2: any) {
            const opLevels = {'no-change': 0, 'add': 1, 'remove': 1, 'replace': 2};
            if (opLevels[op1] === opLevels[op2] && op1 !== 'no-change') {
                return 'replace';
            }
            return opLevels[op1] > opLevels[op2] ? op1 : op2;
        },

        resetVersionFeedModel: function() {
            this.versionFeedModel = {};
            this.versionFeedModelDiff = {};
        }

    } as any;
    
    data.init();
    
    return data;
}

/**
 * The Controller used for the Feed Saving Dialog
 */
export function FeedSavingDialogController($scope: any, $mdDialog: angular.material.IDialogService, message: string, feedName: string) {
    $scope.feedName = feedName;
    $scope.message = message;

    $scope.hide = function () {
        $mdDialog.hide();
    };

    $scope.cancel = function () {
        $mdDialog.cancel();
    };
}

angular.module(require("feed-mgr/module-name"))
    .factory('FeedService', ["$http", "$q", "$mdToast", "$mdDialog", "RestUrlService", "VisualQueryService", "FeedCreationErrorService", "FeedPropertyService", "AccessControlService",
        "EntityAccessControlService", "StateService", FeedService])
    .controller('FeedSavingDialogController', ["$scope", "$mdDialog", "message", "feedName", FeedSavingDialogController]);
