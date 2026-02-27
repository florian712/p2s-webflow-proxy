Update the Learning Hub resources component to use the new API structure.

The API no longer returns fieldData.

Each item now has flattened properties:

slug

name

h1

metaDescription

content

thumbnail

video

author

requireFormSubmission

category

format

industry

language

Replace all references of:

item.fieldData.categories

item.fieldData.category

item.fieldData.format

item.fieldData.industry

item.fieldData.slug

item.fieldData.name

item.fieldData.thumbnail

item.fieldData.content

With:

item.category

item.format

item.industry

item.slug

item.name

item.thumbnail

item.content

Add optional chaining protection where needed:

Example:
Replace any unsafe usage like:

item.categories.map(...)

With:

(item.category ? [item.category] : []).map(...)

Do not change layout or styling.
Only update data references to match the flattened API structure.
Prevent runtime crashes if a field is missing.
