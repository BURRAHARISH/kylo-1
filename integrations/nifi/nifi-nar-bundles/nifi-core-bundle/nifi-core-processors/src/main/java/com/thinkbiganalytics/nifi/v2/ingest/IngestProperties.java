/*
 * Copyright (c) 2016. Teradata Inc.
 */

package com.thinkbiganalytics.nifi.v2.ingest;

import org.apache.nifi.components.PropertyDescriptor;
import org.apache.nifi.processor.Relationship;
import org.apache.nifi.processor.util.StandardValidators;

import com.thinkbiganalytics.nifi.v2.common.CommonProperties;
import com.thinkbiganalytics.nifi.v2.thrift.ThriftService;

/**
 * Properties shared by ingest components
 */
public interface IngestProperties extends CommonProperties {

    /**
     * Common Controller services
     **/

    PropertyDescriptor THRIFT_SERVICE = new PropertyDescriptor.Builder()
        .name("Database Connection Pooling Service")
        .description("The Controller Service that is used to obtain connection to database")
        .required(true)
        .identifiesControllerService(ThriftService.class)
        .build();

    // ---------------------------
    // Common component properties
    // ---------------------------

    /** Source table schema name */
    PropertyDescriptor SOURCE_SCHEMA = new PropertyDescriptor.Builder()
            .name("Source schema")
            .description("Name of the schema or database for the source table")
            .required(true)
            .defaultValue("${metadata.category.systemName}")
            .addValidator(StandardValidators.NON_EMPTY_VALIDATOR)
            .expressionLanguageSupported(true)
            .build();

    /** Source table name */
    PropertyDescriptor SOURCE_TABLE = new PropertyDescriptor.Builder()
            .name("Source table")
            .description("Name of the source table")
            .required(true)
            .defaultValue("${metadata.systemFeedName}_valid")
            .addValidator(StandardValidators.NON_EMPTY_VALIDATOR)
            .expressionLanguageSupported(true)
            .build();

    /** Target table schema name */
    PropertyDescriptor TARGET_SCHEMA = new PropertyDescriptor.Builder()
            .name("Target schema")
            .description("Name of the schema or database for the target table")
            .required(true)
            .defaultValue("${metadata.category.systemName}")
            .addValidator(StandardValidators.NON_EMPTY_VALIDATOR)
            .expressionLanguageSupported(true)
            .build();

    /** Target table name */
    PropertyDescriptor TARGET_TABLE = new PropertyDescriptor.Builder()
        .name("Target table")
        .description("Name of the target table")
        .required(true)
        .defaultValue("${metadata.systemFeedName}")
        .addValidator(StandardValidators.NON_EMPTY_VALIDATOR)
        .expressionLanguageSupported(true)
        .build();

    PropertyDescriptor FEED_PARTITION = new PropertyDescriptor.Builder()
        .name("Feed partition value")
        .description("Feed timestamp that identifies the current feed partition")
        .required(true)
        .defaultValue("${feedts}")
        .addValidator(StandardValidators.NON_EMPTY_VALIDATOR)
        .expressionLanguageSupported(true)
        .build();

    PropertyDescriptor PARTITION_SPECIFICATION = new PropertyDescriptor.Builder()
        .name("Partition Specification")
        .description("Partition specification in format: field|type|formula\nfield|type|formula")
        .defaultValue("${metadata.table.partitionSpecs}")
        .required(false)
        .addValidator(StandardValidators.NON_EMPTY_VALIDATOR)
        .expressionLanguageSupported(true)
        .build();

    PropertyDescriptor FIELD_SPECIFICATION = new PropertyDescriptor.Builder()
        .name("Field specification")
        .description("Pipe-delim format with the specifications for the fields (column name|data type|comment")
        .required(true)
        .defaultValue("${metadata.table.fieldStructure}")
        .addValidator(StandardValidators.NON_EMPTY_VALIDATOR)
        .expressionLanguageSupported(true)
        .build();

    PropertyDescriptor FEED_FORMAT_SPECS = new PropertyDescriptor.Builder()
        .name("Feed Table Storage Format")
        .description(
            "Provide format and delimiter specification. This is the full clause starting with the INPUTFORMAT such as: INPUTFORMAT 'org.apache.hadoop.mapred.TextInputFormat' OUTPUTFORMAT 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat' ")
        .required(true)
        .defaultValue("${metadata.table.feedFormat}")
        .addValidator(StandardValidators.NON_EMPTY_VALIDATOR)
        .expressionLanguageSupported(true)
        .build();

    PropertyDescriptor TARGET_FORMAT_SPECS = new PropertyDescriptor.Builder()
        .name("Target Table Format")
        .description(
            "Provide storage format specification for the target tables")
        .required(true)
        .defaultValue("${metadata.table.targetFormat}")
        .addValidator(StandardValidators.NON_EMPTY_VALIDATOR)
        .expressionLanguageSupported(true)
        .build();

    PropertyDescriptor TARGET_TBLPROPERTIES = new PropertyDescriptor.Builder()
        .name("Target Table Properties")
        .description("TblProperties clause generally specificying the compression option")
        .defaultValue("${metadata.table.targetTblProperties}")
        .addValidator(StandardValidators.NON_EMPTY_VALIDATOR)
        .expressionLanguageSupported(true)
        .build();

    PropertyDescriptor PARTITION_SPECS = new PropertyDescriptor.Builder()
        .name("Partition specification")
        .description("Provide list of partition columns column-delimited")
        .addValidator(StandardValidators.NON_EMPTY_VALIDATOR)
        .defaultValue("${metadata.table.partitionStructure}")
        .expressionLanguageSupported(true)
        .build();

    // Standard Relationships
    Relationship REL_SUCCESS = new Relationship.Builder()
        .name("success")
        .description("Successfully relationship.")
        .build();

    Relationship REL_FAILURE = new Relationship.Builder()
        .name("failure")
        .description("SQL query execution failed. Incoming FlowFile will be penalized and routed to this relationship")
        .build();


}
