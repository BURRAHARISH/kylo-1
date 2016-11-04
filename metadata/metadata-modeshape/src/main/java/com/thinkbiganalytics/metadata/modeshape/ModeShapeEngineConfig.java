/**
 * 
 */
package com.thinkbiganalytics.metadata.modeshape;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

import javax.annotation.PreDestroy;
import javax.inject.Inject;
import javax.jcr.Repository;

import org.modeshape.common.collection.Problems;
import org.modeshape.jcr.JcrRepository;
import org.modeshape.jcr.ModeShapeEngine;
import org.modeshape.jcr.RepositoryConfiguration;
import org.modeshape.jcr.api.txn.TransactionManagerLookup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;

import com.thinkbiganalytics.metadata.modeshape.security.ModeShapeAuthConfig;

/**
 *
 * @author Sean Felten
 */
@Configuration
@Import({ MetadataJcrConfig.class, ModeShapeAuthConfig.class })
public class ModeShapeEngineConfig {
    
    private static final Logger log = LoggerFactory.getLogger(ModeShapeEngineConfig.class);
    
    private static final String[] CONFIG_PROPS = {"modeshape.datasource.driverClassName",
                                                  "modeshape.datasource.url",
                                                  "modeshape.datasource.username",
                                                  "modeshape.datasource.password"
    };
    
    @Inject
    private Environment environment;
    
    
    @PreDestroy
    public void stopEngine() throws InterruptedException, ExecutionException {
        log.info("Stopping ModeShape engine...");
        Future<Boolean> future = modeShapeEngine().shutdown();
        
        if ( future.get() ) {
            log.info("ModeShape engine stopped");
        } else {
            log.info("ModeShape engine not reported as stopped");
        }
    }
    
    @Bean
    public TransactionManagerLookup transactionManagerLookup() throws IOException {
        return metadataRepoConfig().getTransactionManagerLookup();
    }
    
    @Bean
    public RepositoryConfiguration metadataRepoConfig() throws IOException {
        // Expose the values of the config properties as system properties so that they can be used
        // for variable substitution in the ModeShape json config.
        for (String prop : CONFIG_PROPS) {
            if (this.environment.containsProperty(prop)) {
                System.setProperty(prop, this.environment.getProperty(prop));
            }
        }
        
        ClassPathResource res = new ClassPathResource("/metadata-repository.json");
        RepositoryConfiguration config = RepositoryConfiguration.read(res.getURL());
        
        Problems problems = config.validate();
        if (problems.hasErrors()) {
            log.error("Problems with the ModeShape repository configuration: \n{}", problems);
            throw new RuntimeException("Problems with the ModeShape repository configuration: " + problems);
        }
        
//        config.getSecurity();
        
        return config;
    }

    @Bean
    public ModeShapeEngine modeShapeEngine() {
        ModeShapeEngine engine = new ModeShapeEngine();
        log.info("Starting ModeShape engine...");
        engine.start();
        log.info("ModeShape engine started");
        return engine;
    }
    
    @Bean(name="metadataJcrRepository")
    public Repository metadataJcrRepository() throws Exception {
        JcrRepository repo = modeShapeEngine().deploy(metadataRepoConfig());
        
        Problems problems = repo.getStartupProblems();
        if (problems.hasErrors()) {
            log.error("Problems starting the metadata ModeShape repository: {}  \n{}", repo.getName(), problems);
            throw new RuntimeException("Problems starting the ModeShape metadata repository: " + problems);
        }
        
        return repo;
    }
}
