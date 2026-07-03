import torch
import torch.nn as nn
import torch.nn.functional as F

class CNNAudio(nn.Module):
    def __init__(self, num_clases=10):
        super(CNNAudio, self).__init__()
        
        self.bloque1 = nn.Sequential(
            nn.Conv2d(1, 16, kernel_size=3, padding=1),
            nn.BatchNorm2d(16),
            nn.ReLU(),
            nn.MaxPool2d(2, 2)
        )
        
        self.bloque2 = nn.Sequential(
            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2, 2)
        )
        
        self.bloque3 = nn.Sequential(
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2, 2)
        )
        
        self.clasificador = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 16 * 21, 128),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, num_clases)
        )

    def forward(self, x):
        x = self.bloque1(x)
        x = self.bloque2(x)
        x = self.bloque3(x)
        x = self.clasificador(x)
        return x
