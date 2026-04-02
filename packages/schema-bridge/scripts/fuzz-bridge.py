import sys
import json
from schemathesis import openapi
from typing import List

def clean_not_set(obj):
    if isinstance(obj, dict):
        return {k: clean_not_set(v) for k, v in obj.items() if type(v).__name__ != "NotSet"}
    if isinstance(obj, list):
        return [clean_not_set(v) for v in obj if type(v).__name__ != "NotSet"]
    return obj

def generate_fuzz_samples(spec_path: str, count: int = 50) -> List[dict]:
    """
    Uses Schemathesis to generate samples purely from the OpenAPI spec
    without a running server.
    """
    schema = openapi.from_path(spec_path)
    samples = []
    
    # We iterate over all operations and generate a few samples for each
    for result in schema.get_all_operations():
        endpoint = result.ok()
        strategy = endpoint.as_strategy()
        
        for _ in range(5):
            try:
                case = strategy.example()
                if case.body is not None and type(case.body).__name__ != "NotSet":
                    cleaned = clean_not_set(case.body)
                    samples.append(cleaned)
                if len(samples) >= count:
                    return samples
            except Exception:
                continue
                
    return samples

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 fuzz-bridge.py <spec_path> <output_path> [count]")
        sys.exit(1)
        
    spec = sys.argv[1]
    output = sys.argv[2]
    count = int(sys.argv[3]) if len(sys.argv) > 3 else 50
    
    print(f"🧬 Generating {count} fuzz samples from {spec}...")
    try:
        data = generate_fuzz_samples(spec, count)
        with open(output, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"✅ Samples saved to {output}")
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        sys.exit(1)
