import {
    ApolloServerPlugin,
    BaseContext,
    GraphQLRequestExecutionListener,
    GraphQLRequestListener
} from '@apollo/server';
export default function plugin<TContext extends BaseContext>(
    affectedTables: Set<string>
): ApolloServerPlugin<TContext> {
    return {
        async requestDidStart(): Promise<GraphQLRequestListener<any>> {
            return {
                async executionDidStart(): Promise<GraphQLRequestExecutionListener<any> | void> {
                    affectedTables.clear();
                }
            };
        },
    };
}
