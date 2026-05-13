import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { HomePage } from './home.page';
import { SupabaseService } from '../services/supabase.service';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    sessionStorage.clear();

    await TestBed.configureTestingModule({
      declarations: [HomePage],
      imports: [CommonModule, FormsModule, IonicModule.forRoot()],
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            getProfileById: jasmine.createSpy('getProfileById').and.resolveTo({ data: null, error: null }),
            getAllData: jasmine.createSpy('getAllData').and.resolveTo({ data: null, error: null }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
