export default `#graphql

enum CacheControlScope {
    PUBLIC
    PRIVATE
}

directive @cacheControl(
    maxAge: Int
    scope: CacheControlScope
    inheritMaxAge: Boolean
) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

type Book @cacheControl(maxAge: 200) {
    id: String
    title: String
    author: Author
    languages: [Language]
    stores: [Store]
}

type Author @cacheControl(maxAge: 200) {
    id: String
    name: String
    books: [Book]
}

type Language {
    id: String
    lan: String
    books: [String]
}

type Store @cacheControl(maxAge: 100) {
    id: String
    city: String
    books: [Book]
}

type Query {
    books: [Book]
}
`;
