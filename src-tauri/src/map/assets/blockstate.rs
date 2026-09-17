use std::collections::HashMap;

use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ModelReference {
    pub(crate) model: String,
    pub(crate) x: u32,
    pub(crate) y: u32,
    pub(crate) uvlock: bool,
}

pub(crate) fn model_references(
    blockstate: &Value,
    encoded_properties: &str,
) -> Vec<ModelReference> {
    let properties = parse_properties(encoded_properties);
    if let Some(variants) = blockstate.get("variants").and_then(Value::as_object) {
        let key = variants
            .get(encoded_properties)
            .or_else(|| variants.get(""))
            .or_else(|| variants.values().next());
        return key.map(parse_apply).unwrap_or_default();
    }

    blockstate
        .get("multipart")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|part| {
            part.get("when")
                .map(|condition| matches_condition(condition, &properties))
                .unwrap_or(true)
        })
        .flat_map(|part| part.get("apply").map(parse_apply).unwrap_or_default())
        .collect()
}

fn parse_apply(value: &Value) -> Vec<ModelReference> {
    match value {
        Value::Array(values) => values.iter().filter_map(parse_reference).collect(),
        value => parse_reference(value).into_iter().collect(),
    }
}

fn parse_reference(value: &Value) -> Option<ModelReference> {
    let object = value.as_object()?;
    Some(ModelReference {
        model: object.get("model")?.as_str()?.to_string(),
        x: object.get("x").and_then(Value::as_u64).unwrap_or(0) as u32 % 360,
        y: object.get("y").and_then(Value::as_u64).unwrap_or(0) as u32 % 360,
        uvlock: object
            .get("uvlock")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

fn parse_properties(encoded_properties: &str) -> HashMap<&str, &str> {
    encoded_properties
        .split(',')
        .filter_map(|property| property.split_once('='))
        .collect()
}

fn matches_condition(condition: &Value, properties: &HashMap<&str, &str>) -> bool {
    let Some(object) = condition.as_object() else {
        return true;
    };
    if let Some(or_conditions) = object.get("OR").and_then(Value::as_array) {
        return or_conditions
            .iter()
            .any(|candidate| matches_condition(candidate, properties));
    }

    object.iter().all(|(key, expected)| {
        let Some(actual) = properties.get(key.as_str()) else {
            return false;
        };
        match expected {
            Value::Array(values) => values.iter().any(|value| value.as_str() == Some(actual)),
            Value::String(expected) => expected.split('|').any(|value| value == *actual),
            _ => false,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn variants_select_exact_properties_before_fallback() {
        let value = serde_json::json!({
            "variants": {
                "": {"model": "minecraft:block/default"},
                "facing=north": {"model": "minecraft:block/north", "y": 90}
            }
        });
        assert_eq!(
            model_references(&value, "facing=north"),
            vec![ModelReference {
                model: "minecraft:block/north".to_string(),
                x: 0,
                y: 90,
                uvlock: false,
            }]
        );
    }

    #[test]
    fn multipart_honours_basic_when_and_or_conditions() {
        let value = serde_json::json!({
            "multipart": [
                {"when": {"powered": "true"}, "apply": {"model": "minecraft:block/powered"}},
                {"when": {"OR": [{"facing": "north|south"}, {"facing": "east"}]}, "apply": [{"model": "minecraft:block/side"}]}
            ]
        });
        let models = model_references(&value, "powered=true,facing=south");
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].model, "minecraft:block/powered");
        assert_eq!(models[1].model, "minecraft:block/side");
    }
}
