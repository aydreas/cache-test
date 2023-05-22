import { ApolloServer, BaseContext, GraphQLRequestContext } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { KeyValueCacheSetOptions } from '@apollo/utils.keyvaluecache';
import responseCachePlugin from '@apollo/server-plugin-response-cache';
import { Redis } from 'ioredis';

import typeDefs from './schema.js';
import { books, authors, stores, languages } from './data.js';
import affectedTablesPlugin from './affectedTablesPlugin.js';

// Redis has to be configured with a suitable TTL and either LRU or LFU policy.
const redis = new Redis({
    host: 'redis'
});

redis.on('connect', () => console.log('Redis connected'));

// If something in the database changes, the affected tables should be pushed to the api(s) and reflected here
// They represent the timestamp when the last change was for that particular table

// This logic can be used for the DB cache in exactly the same way.

// Also - these selectors could further restrict which data is expired by adding the id(s) of the rows changed
// The expiry check would take longer and the logic is much more complicated - but that could be worth it
// But row detection is probably only cleanly possible by using CDC

// One way of doing it is basically the same as the queries now work, just with mutations
// E.g.: Keep track of tables that the mutation change and push them through PubSub at the end of the request
// Another way could be something like https://www.mongodb.com/docs/kafka-connector/current/sink-connector/fundamentals/change-data-capture/
// (https://medium.com/team-pratilipi/intelligent-caching-with-apollo-graphql-blazing-performance-and-massive-scalability-2d92a7cfb3a6)
const lastKnownValuesFromPubSub = new Map<string, number>([
    [ "constraint:db.books", 33 ],
    [ "constraint:db.author", 456 ]
]);

// This is just for demonstration, of course this should be in the context or similar
const affectedTables = new Set<string>;

const resolvers = {
    Query: {
        books: () => {
            console.log('books');

            // We can do this with a decorator or with a generator
            // This needs to add the whole as no specific ids are queried
            affectedTables.add('constraint:db.books');

            return books;
        }
    },
    Book: {
        author(parent) {
            console.log('author', parent);

            // We can do this with a decorator or with a generator
            // We could further restrict this constraint by providing the id which is queried
            affectedTables.add('constraint:db.author');

            return authors.find(x => x.id === parent.author);
        },
        languages(parent) {
            console.log('languages', parent);

            // We can do this with a decorator or with a generator
            affectedTables.add('constraint:db.languages');

            return parent.languages.map(x => languages.find(y => y.id === x));
        },
        stores(parent) {
            console.log('stores', parent);

            // We can do this with a decorator or with a generator
            affectedTables.add('constraint:db.stores');

            return stores.filter(x => x.books.includes(parent.id));
        }
    }
}

const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [
        responseCachePlugin({
            sessionId: async (ctx) => {
                return ctx.request.http.headers.get('session-id') || null
            }
        }),
        affectedTablesPlugin(affectedTables) // This just clears affected tables on every req start... JUST FOR DEMONSTRATION
    ],
    cache: {
        async get(key: string): Promise<string | undefined> {
            console.log({
                action: 'get',
                key,
                lastKnownValuesFromPubSub
            });
            const result = await redis.hgetall(key);
            if (!result?.data) {
                console.log("->not found");
                return undefined;
            }

            for (const [key, value] of Object.entries(result)) {
                if (key == "data")
                    continue;

                // If db has newer data on any table which is flagged in the dataset,
                // then this entry is invalid and can be deleted
                if (lastKnownValuesFromPubSub.get(key) > Number(value)) {
                    console.log("->expired");
                    // We don't need to delete the key,
                    // as it gets refreshed by the current request anyway
                    return undefined;
                }
            }

            console.log("->found");
            console.log(result);
            return result.data;
        },
        async set(key:string, value:string, options?: KeyValueCacheSetOptions) {
            console.log({
                action: 'set',
                key,
                value,
                options,
                lastKnownValuesFromPubSub,
                affectedTables
            })

            const entry = { data: value };
            for (const constraint of affectedTables) {
                entry[constraint] = lastKnownValuesFromPubSub.get(constraint) ?? 0;
            }
            redis.hset(key, entry);
        },
        async delete(key:string) {
            console.log({
                action: 'delete',
                key
            });
            redis.hdel(key);
            return true;
        }
    }
});

startStandaloneServer(server, {
    listen: { port: 4000 }
}).then(({ url }) => console.log(`🚀  Server ready at: ${url}`));

