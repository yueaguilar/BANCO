import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  ngOnInit(): void {
    const isRootPage = ['/', '/index.html', ''].includes(window.location.pathname);
    if (isRootPage) {
      window.location.replace('/pages/login.html');
    }
  }
}
