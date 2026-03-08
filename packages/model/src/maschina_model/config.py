from pydantic import BaseModel


class ModelConfig(BaseModel):
    # Base model
    base_model: str = "THUDM/glm-4-9b"
    model_name: str = "maschina-model"  # rename once named

    # LoRA fine-tuning
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    lora_target_modules: list[str] = ["query_key_value", "dense"]

    # Training
    max_seq_length: int = 4096
    per_device_train_batch_size: int = 2
    gradient_accumulation_steps: int = 8
    num_train_epochs: int = 3
    learning_rate: float = 2e-4
    warmup_ratio: float = 0.03
    lr_scheduler_type: str = "cosine"
    fp16: bool = False
    bf16: bool = True  # A100 / H100

    # Output
    output_dir: str = "./checkpoints"
    logging_steps: int = 10
    save_steps: int = 100
    eval_steps: int = 100
